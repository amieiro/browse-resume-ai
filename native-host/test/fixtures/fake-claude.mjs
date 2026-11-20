#!/usr/bin/env node
// Stand-in for the claude CLI in tests. Behaviour is chosen with FAKE_MODE.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const mode = process.env.FAKE_MODE ?? 'ok';
if (process.argv.includes('--version')) {
  process.stdout.write(`${process.env.FAKE_VERSION ?? '2.1.329 (Claude Code)'}\n`);
  process.exit(0);
}
let stdin = '';
process.stdin.on('data', (d) => (stdin += d));
process.stdin.on('end', () => {
  if (process.env.FAKE_RECORD) {
    writeFileSync(process.env.FAKE_RECORD, JSON.stringify({ argv: process.argv.slice(2), stdin, cwd: process.cwd() }));
  }
  if (mode === 'ok') {
    process.stdout.write(readFileSync(join(here, 'claude-stream.jsonl')));
  } else if (mode === 'auth') {
    process.stdout.write('{"type":"result","subtype":"success","is_error":true,"result":"Not logged in · Please run /login"}\n');
    process.exit(1);
  } else if (mode === 'fail-split') {
    // An error message split in the middle of a multi-byte character, in two writes.
    const bytes = Buffer.from('Erro: ñandú 🙂 fallou\n');
    const cut = bytes.indexOf(Buffer.from('🙂')) + 2;
    process.stderr.write(bytes.subarray(0, cut));
    setTimeout(() => {
      process.stderr.write(bytes.subarray(cut));
      process.exit(2);
    }, 50);
  } else if (mode === 'fail') {
    process.stderr.write('something broke\n');
    process.exit(2);
  } else if (mode === 'limit') {
    process.stdout.write('{"type":"result","is_error":true,"result":"You\'ve hit your usage limit · resets 3pm"}\n');
    process.exit(1);
  } else if (mode === 'fail-warn') {
    process.stderr.write('Warning: this sign-in ends in 3 days. Run claude auth login before then.\n');
    process.exit(2);
  } else if (mode === 'hang') {
    process.stdout.write('{"type":"stream_event","event":{"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"partial"}}}\n');
    setInterval(() => {}, 1000);
  }
});
