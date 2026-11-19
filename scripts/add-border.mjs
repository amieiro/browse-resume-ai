// Adds a black border to a PNG that looks 1px wide at the width the README shows it, using macOS
// sips. GitHub strips CSS from README images, so the border has to be part of the image.
//
// Usage: node scripts/add-border.mjs <file.png> <displayed width in px>
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

function size(file) {
  const out = execFileSync('sips', ['-g', 'pixelWidth', '-g', 'pixelHeight', file], { encoding: 'utf8' });
  const [, width] = /pixelWidth: (\d+)/.exec(out);
  const [, height] = /pixelHeight: (\d+)/.exec(out);
  return { width: Number(width), height: Number(height) };
}

export function addBorder(file, displayWidth) {
  const { width, height } = size(file);
  const px = Math.max(1, Math.round(width / displayWidth));
  execFileSync('sips', ['-p', String(height + 2 * px), String(width + 2 * px), '--padColor', '000000', file], {
    stdio: 'ignore',
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [file, displayWidth] = process.argv.slice(2);
  if (!file || !displayWidth) {
    console.error('Usage: node scripts/add-border.mjs <file.png> <displayed width>');
    process.exit(1);
  }
  addBorder(file, Number(displayWidth));
}
