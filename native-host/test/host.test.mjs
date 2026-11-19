// @vitest-environment node
import { spawn } from 'node:child_process';
import { mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDecoder, encodeMessage } from '../lib/framing.mjs';

const HOST = fileURLToPath(new URL('../host.mjs', import.meta.url));
const FAKE = fileURLToPath(new URL('./fixtures/fake-claude.mjs', import.meta.url));
const FAKE_CODEX = fileURLToPath(new URL('./fixtures/fake-codex.mjs', import.meta.url));
const children = [];

function startHost(env = {}) {
  const record = join(mkdtempSync(join(tmpdir(), 'bra-host-')), 'record.json');
  const child = spawn(process.execPath, [HOST], {
    env: { ...process.env, CLAUDE_BIN: FAKE, CODEX_BIN: FAKE_CODEX, FAKE_MODE: 'ok', FAKE_RECORD: record, ...env },
  });
  children.push(child);
  const messages = [];
  child.stdout.on('data', createDecoder((m) => messages.push(m)));
  return { child, messages, record, send: (m) => child.stdin.write(encodeMessage(m)) };
}

// Spawning node processes is slow when the whole suite runs in parallel.
const waitFor = (fn) => vi.waitFor(fn, { timeout: 5000, interval: 20 });

afterEach(() => {
  for (const c of children.splice(0)) c.kill();
});

describe('native host', () => {
  it('answers ping', async () => {
    const h = startHost();
    h.send({ type: 'ping' });
    await waitFor(() =>
      expect(h.messages).toEqual([expect.objectContaining({ type: 'pong', claudeFound: true, codexFound: true })]),
    );
  });

  it('reports codexFound false when codex is missing', async () => {
    const h = startHost({ CODEX_BIN: '/nonexistent/codex' });
    h.send({ type: 'ping' });
    await waitFor(() => expect(h.messages[0]).toMatchObject({ type: 'pong', claudeFound: true, codexFound: false }));
  });

  it('streams a Codex summary', async () => {
    const h = startHost();
    h.send({ type: 'summarize', id: 'c1', provider: 'codex', model: 'gpt-6-luna', prompt: 'p' });
    await waitFor(() => expect(h.messages.at(-1)).toEqual({ type: 'done', id: 'c1' }));
    const text = h.messages.filter((m) => m.type === 'chunk').map((m) => m.text).join('');
    expect(text).toBe('Ola ñandú 🙂\n\n- punto clave');
  });

  it('reports claudeFound false when the binary is missing', async () => {
    const h = startHost({ CLAUDE_BIN: '/nonexistent/claude' });
    h.send({ type: 'ping' });
    await waitFor(() => expect(h.messages[0]).toMatchObject({ type: 'pong', claudeFound: false }));
  });

  it('streams a summary', async () => {
    const h = startHost();
    h.send({ type: 'summarize', id: 'r1', provider: 'claude', model: 'sonnet', prompt: 'p' });
    await waitFor(() => expect(h.messages.at(-1)).toEqual({ type: 'done', id: 'r1' }));
    const text = h.messages.filter((m) => m.type === 'chunk').map((m) => m.text).join('');
    expect(text).toBe('Ola ñandú 🙂\n\n- punto clave');
  });

  it.each(['--dangerously-skip-permissions', '-x', 'a b', 'a;b', '', 'x'.repeat(65)])(
    'rejects the model name %j without starting claude',
    async (model) => {
      const h = startHost();
      h.send({ type: 'summarize', id: 'r1', provider: 'claude', model, prompt: 'p' });
      await waitFor(() => expect(h.messages[0]).toMatchObject({ type: 'error', id: 'r1', code: 'bad_request' }));
      await new Promise((r) => setTimeout(r, 150));
      expect(existsSync(h.record)).toBe(false);
    },
  );

  it.each([
    { type: 'nope', id: 'r1' },
    { type: 'summarize', provider: 'claude', model: 'sonnet', prompt: 'p' },
    { type: 'summarize', id: 'r1', provider: 'other', model: 'sonnet', prompt: 'p' },
    { type: 'summarize', id: 'r1', provider: 'claude', model: 'sonnet' },
  ])('rejects a malformed request %j', async (msg) => {
    const h = startHost();
    h.send(msg);
    await waitFor(() => expect(h.messages[0]).toMatchObject({ type: 'error', code: 'bad_request' }));
  });

  it('ignores cancel for an unknown id', async () => {
    const h = startHost();
    h.send({ type: 'cancel', id: 'unknown' });
    h.send({ type: 'ping' });
    await waitFor(() => expect(h.messages).toEqual([expect.objectContaining({ type: 'pong' })]));
  });

  it('cancel stops a running request without a done message', async () => {
    const h = startHost({ FAKE_MODE: 'hang' });
    h.send({ type: 'summarize', id: 'r1', provider: 'claude', model: 'sonnet', prompt: 'p' });
    await waitFor(() => expect(h.messages[0]).toEqual({ type: 'chunk', id: 'r1', text: 'partial' }));
    h.send({ type: 'cancel', id: 'r1' });
    await new Promise((r) => setTimeout(r, 300));
    expect(h.messages.map((m) => m.type)).toEqual(['chunk']);
  });

  it('exits when stdin closes', async () => {
    const h = startHost();
    const exited = new Promise((r) => h.child.on('exit', r));
    h.child.stdin.end();
    await exited;
  });
});
