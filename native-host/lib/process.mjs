import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { commandFor } from './resolve-cli.mjs';

/**
 * Runs a CLI once in an empty temporary directory, prompt on stdin, never through a shell.
 * Exactly one of onDone / onError is called, unless cancel() was called first.
 *
 * parser: { write(chunk: Buffer), end(): { isError, errorText } }
 * classifyError(detail: string): error code for a failed run
 */
export function runProcess({ command, args, prompt, parser, classifyError, missingCode, onDone, onError }) {
  const cwd = mkdtempSync(join(tmpdir(), 'browse-resume-ai-'));
  let finished = false;
  let stderr = '';

  const finish = (fn) => {
    if (finished) return;
    finished = true;
    rmSync(cwd, { recursive: true, force: true });
    fn?.();
  };

  let child;
  try {
    const { command: executable, prefix } = commandFor(command);
    child = spawn(executable, [...prefix, ...args(cwd)], { cwd, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
  } catch (error) {
    // spawn throws synchronously for some invalid commands (e.g. a .cmd file on Windows).
    queueMicrotask(() => finish(() => onError(missingCode, error.message)));
    return { cancel: () => finish() };
  }

  child.on('error', (error) => {
    finish(() => onError(error.code === 'ENOENT' || error.code === 'EACCES' ? missingCode : 'provider_failed', error.message));
  });
  child.stdout.on('data', (chunk) => {
    if (!finished) parser.write(chunk);
  });
  // Decoded as a stream, so a character split between two chunks comes out whole.
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (text) => {
    if (stderr.length < 4000) stderr += text;
  });
  child.on('close', (code) => {
    if (finished) return;
    const result = parser.end();
    if (code === 0 && !result.isError) return finish(onDone);
    const detail = `${result.errorText}\n${stderr}`.trim();
    finish(() => onError(classifyError(detail), detail.slice(0, 500)));
  });
  child.stdin.on('error', () => {});
  child.stdin.end(prompt);

  return {
    cancel() {
      finish();
      child.kill('SIGTERM');
    },
  };
}
