import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

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

  const child = spawn(command, args(cwd), { cwd, stdio: ['pipe', 'pipe', 'pipe'] });

  child.on('error', (error) => {
    finish(() => onError(error.code === 'ENOENT' || error.code === 'EACCES' ? missingCode : 'provider_failed', error.message));
  });
  child.stdout.on('data', (chunk) => {
    if (!finished) parser.write(chunk);
  });
  child.stderr.on('data', (chunk) => {
    if (stderr.length < 4000) stderr += chunk.toString('utf8');
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
