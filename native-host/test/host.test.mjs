// @vitest-environment node
import { spawn } from 'node:child_process';
import { mkdtempSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDecoder, encodeMessage } from '../lib/framing.mjs';
import { startFakeOllama } from './fixtures/fake-ollama.mjs';

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
  it('reports the version in package.json', async () => {
    const { version } = JSON.parse(readFileSync(fileURLToPath(new URL('../../package.json', import.meta.url)), 'utf8'));
    const h = startHost();
    h.send({ type: 'ping' });
    await waitFor(() => expect(h.messages[0]).toMatchObject({ type: 'pong', version }));
  });

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

  describe('model lists', () => {
    const CLAUDE_CONFIG = fileURLToPath(new URL('./fixtures/claude-config', import.meta.url));

    it('reports the CLI versions', async () => {
      const h = startHost();
      h.send({ type: 'versions' });
      await waitFor(() => expect(h.messages[0]).toEqual({ type: 'versions', claude: '2.1.329 (Claude Code)', codex: 'codex-cli 0.169.0' }));
    });

    it('lists the models of every provider, with versions', async () => {
      const h = startHost({ CLAUDE_CONFIG_DIR: CLAUDE_CONFIG, OLLAMA_HOST: '127.0.0.1:9' });
      h.send({ type: 'models' });
      await waitFor(() => expect(h.messages[0]).toMatchObject({ type: 'models' }));
      expect(h.messages[0]).toEqual({
        type: 'models',
        claude: { version: '2.1.329 (Claude Code)', models: expect.arrayContaining(['sonnet', 'claude-opus-5-5']) },
        codex: { version: 'codex-cli 0.169.0', models: ['gpt-6.2-sol', 'gpt-6.2-astra', 'gpt-6-luna'] },
        ollama: { found: false, models: [] },
      });
    });

    it('gives null lists for missing CLIs', async () => {
      const h = startHost({ CLAUDE_BIN: '/nonexistent/claude', CODEX_BIN: '/nonexistent/codex', CLAUDE_CONFIG_DIR: '/nonexistent', OLLAMA_HOST: '127.0.0.1:9' });
      h.send({ type: 'models' });
      await waitFor(() => expect(h.messages[0]).toMatchObject({ type: 'models' }));
      expect(h.messages[0]).toMatchObject({ claude: { version: null, models: null }, codex: { version: null, models: null } });
    });
  });

  describe('Ollama', () => {
    let fake;
    afterEach(async () => {
      await fake?.close();
      fake = undefined;
    });

    it('checks Ollama and lists its models only when the ping asks', async () => {
      fake = await startFakeOllama({ models: ['llama3.2:latest', 'qwen3:4b'] });
      const h = startHost({ OLLAMA_HOST: fake.url });
      h.send({ type: 'ping' });
      h.send({ type: 'ping', ollama: true });
      await waitFor(() => expect(h.messages).toHaveLength(2));
      expect(h.messages[0]).not.toHaveProperty('ollamaFound');
      expect(h.messages[1]).toMatchObject({ type: 'pong', ollamaFound: true, ollamaModels: ['llama3.2:latest', 'qwen3:4b'] });
    });

    it('reports ollamaFound false when Ollama is not running', async () => {
      const h = startHost({ OLLAMA_HOST: '127.0.0.1:9' });
      h.send({ type: 'ping', ollama: true });
      await waitFor(() => expect(h.messages[0]).toMatchObject({ type: 'pong', ollamaFound: false, ollamaModels: [] }));
    });

    it('streams an Ollama summary', async () => {
      fake = await startFakeOllama();
      const h = startHost({ OLLAMA_HOST: fake.url });
      h.send({ type: 'summarize', id: 'o1', provider: 'ollama', model: 'llama3.2', prompt: 'p' });
      await waitFor(() => expect(h.messages.at(-1)).toEqual({ type: 'done', id: 'o1' }));
      expect(h.messages.filter((m) => m.type === 'chunk').map((m) => m.text).join('')).toBe('Ola ñandú 🙂');
    });

    it.each(['llama3.2:3b', 'hf.co/bartowski/Llama-3.2-1B-Instruct-GGUF:Q4_K_M', 'qwen3'])('accepts the Ollama model name %j', async (model) => {
      fake = await startFakeOllama({ models: [model] });
      const h = startHost({ OLLAMA_HOST: fake.url });
      h.send({ type: 'summarize', id: 'o2', provider: 'ollama', model, prompt: 'p' });
      await waitFor(() => expect(h.messages.at(-1)).toEqual({ type: 'done', id: 'o2' }));
    });

    it.each(['-x', 'a b', '../x', 'a;b', 'x'.repeat(201)])('rejects the Ollama model name %j', async (model) => {
      const h = startHost();
      h.send({ type: 'summarize', id: 'o3', provider: 'ollama', model, prompt: 'p' });
      await waitFor(() => expect(h.messages[0]).toMatchObject({ type: 'error', id: 'o3', code: 'bad_request' }));
    });

    it('keeps the stricter names for the CLIs', async () => {
      const h = startHost();
      h.send({ type: 'summarize', id: 'r9', provider: 'claude', model: 'sonnet:x', prompt: 'p' });
      await waitFor(() => expect(h.messages[0]).toMatchObject({ type: 'error', id: 'r9', code: 'bad_request' }));
    });
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
