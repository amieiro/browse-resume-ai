// @vitest-environment node
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runClaude } from '../lib/runner.mjs';

const FAKE = fileURLToPath(new URL('./fixtures/fake-claude.mjs', import.meta.url));

function run(mode, extra = {}) {
  const record = join(mkdtempSync(join(tmpdir(), 'bra-test-')), 'record.json');
  vi.stubEnv('FAKE_MODE', mode);
  vi.stubEnv('FAKE_RECORD', record);
  let text = '';
  const events = [];
  let handle;
  const done = new Promise((resolve) => {
    handle = runClaude({
      claudePath: FAKE,
      model: 'sonnet',
      prompt: 'THE PROMPT',
      onText: (t) => (text += t),
      onDone: () => (events.push('done'), resolve()),
      onError: (code) => (events.push(`error:${code}`), resolve()),
      ...extra,
    });
  });
  return { done, handle, events, getText: () => text, record };
}

// Spawning node processes is slow when the whole suite runs in parallel.
const waitFor = (fn) => vi.waitFor(fn, { timeout: 5000, interval: 20 });

afterEach(() => vi.unstubAllEnvs());

describe('runClaude', () => {
  it('streams text and finishes once', async () => {
    const r = run('ok');
    await r.done;
    expect(r.getText()).toBe('Ola ñandú 🙂\n\n- punto clave');
    expect(r.events).toEqual(['done']);
  });

  it('passes the model as an argument and the prompt on stdin only', async () => {
    const r = run('ok');
    await r.done;
    const rec = JSON.parse(readFileSync(r.record, 'utf8'));
    expect(rec.argv).toEqual(expect.arrayContaining(['--print', '--model', 'sonnet', '--tools', '', '--restricted']));
    expect(rec.argv.join(' ')).not.toContain('THE PROMPT');
    expect(rec.stdin).toBe('THE PROMPT');
  });

  it('runs in an empty temporary directory that is removed afterwards', async () => {
    const r = run('ok');
    await r.done;
    const { cwd } = JSON.parse(readFileSync(r.record, 'utf8'));
    expect(cwd).toContain('browse-resume-ai-');
    await waitFor(() => expect(existsSync(cwd)).toBe(false));
  });

  it('maps a login failure to claude_auth', async () => {
    const r = run('auth');
    await r.done;
    expect(r.events).toEqual(['error:claude_auth']);
  });

  it('maps a usage limit to usage_limit', async () => {
    const r = run('limit');
    await r.done;
    expect(r.events).toEqual(['error:usage_limit']);
  });

  it('maps another failure to provider_failed', async () => {
    const r = run('fail');
    await r.done;
    expect(r.events).toEqual(['error:provider_failed']);
  });

  it('does not mistake the sign-in expiry warning for a login failure', async () => {
    const r = run('fail-warn');
    await r.done;
    expect(r.events).toEqual(['error:provider_failed']);
  });

  it('maps a missing executable to claude_missing', async () => {
    const r = run('ok', { claudePath: '/nonexistent/claude' });
    await r.done;
    expect(r.events).toEqual(['error:claude_missing']);
  });

  it('cancel kills the child without reporting', async () => {
    const r = run('hang');
    await waitFor(() => expect(r.getText()).toBe('partial'));
    r.handle.cancel();
    await new Promise((res) => setTimeout(res, 300));
    expect(r.events).toEqual([]);
  });
});

describe('runClaude with a JavaScript entry point', () => {
  it('starts it with Node (how npm-installed CLIs run on Windows)', async () => {
    const { mkdtempSync, writeFileSync, readFileSync: read } = await import('node:fs');
    const dir = mkdtempSync(join(tmpdir(), 'bra-js-'));
    const entry = join(dir, 'cli.js');
    writeFileSync(entry, `require('node:fs').writeFileSync(${JSON.stringify(join(dir, 'ran'))}, process.argv.slice(2).join(' '));
process.stdout.write(require('node:fs').readFileSync(${JSON.stringify(fileURLToPath(new URL('./fixtures/claude-stream.jsonl', import.meta.url)))}));`);
    const r = run('ok', { claudePath: entry });
    await r.done;
    expect(r.events).toEqual(['done']);
    expect(read(join(dir, 'ran'), 'utf8')).toContain('--print');
  });
});
