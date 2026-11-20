#!/usr/bin/env node
// Stand-in for the codex CLI in tests. Behaviour is chosen with FAKE_MODE.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const mode = process.env.FAKE_MODE ?? 'ok';
if (process.argv.includes('--version')) {
  process.stdout.write(`${process.env.FAKE_VERSION ?? 'codex-cli 0.169.0'}\n`);
  process.exit(0);
}
if (process.argv[2] === 'debug' && process.argv[3] === 'models') {
  if (process.env.FAKE_MODELS === 'fail') process.exit(1);
  process.stdout.write(readFileSync(join(here, 'codex-models.json')));
  process.exit(0);
}
let stdin = '';
process.stdin.on('data', (d) => (stdin += d));
process.stdin.on('end', () => {
  if (process.env.FAKE_RECORD) {
    writeFileSync(process.env.FAKE_RECORD, JSON.stringify({ argv: process.argv.slice(2), stdin, cwd: process.cwd() }));
  }
  if (mode === 'ok') {
    process.stdout.write(readFileSync(join(here, 'codex-stream.jsonl')));
  } else if (mode === 'auth') {
    process.stdout.write('{"type":"turn.failed","error":{"message":"unexpected status 401 Unauthorized: Please run codex login"}}\n');
    process.exit(1);
  } else if (mode === 'limit') {
    process.stdout.write('{"type":"error","message":"You\'ve hit your usage limit. Try again later."}\n');
    process.exit(1);
  } else if (mode === 'fail') {
    process.stderr.write('something broke\n');
    process.exit(2);
  } else if (mode === 'hang') {
    setInterval(() => {}, 1000);
  }
});
