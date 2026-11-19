// Writes the table of contents of README.md between the <!-- toc --> and <!-- tocstop --> markers,
// with every heading from h1 to h6 and GitHub's anchor rules (duplicates get -1, -2...).
//
// Usage: node scripts/readme-toc.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const README = join(dirname(fileURLToPath(import.meta.url)), '..', 'README.md');
const START = '<!-- toc -->';
const END = '<!-- tocstop -->';

export function slug(text) {
  return text
    .trim()
    .toLowerCase()
    .replace(/<[^>]+>/g, '')
    .replace(/[^\p{L}\p{N}\s_-]/gu, '')
    .replace(/\s/g, '-');
}

export function buildToc(markdown) {
  const seen = new Map();
  const lines = [];
  let inFence = false;
  const withoutToc = markdown.replace(new RegExp(`${START}[\\s\\S]*?${END}`), '');
  for (const line of withoutToc.split('\n')) {
    if (/^\s*```/.test(line)) inFence = !inFence;
    const match = !inFence && /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
    if (!match) continue;
    const [, hashes, title] = match;
    const base = slug(title);
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    const anchor = count ? `${base}-${count}` : base;
    const text = title.replace(/`/g, '');
    lines.push(`${'  '.repeat(hashes.length - 1)}- [${text}](#${anchor})`);
  }
  return lines.join('\n');
}

const markdown = readFileSync(README, 'utf8');
if (!markdown.includes(START) || !markdown.includes(END)) {
  console.error(`README.md needs ${START} and ${END} markers.`);
  process.exit(1);
}
const toc = `${START}\n\n**Contents**\n\n${buildToc(markdown)}\n\n${END}`;
writeFileSync(README, markdown.replace(new RegExp(`${START}[\\s\\S]*?${END}`), toc));
console.log('README.md table of contents updated');
