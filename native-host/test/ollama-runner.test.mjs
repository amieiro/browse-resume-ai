// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import { checkOllama, ollamaBaseUrl, runOllama } from '../lib/ollama-runner.mjs';
import { startFakeOllama } from './fixtures/fake-ollama.mjs';

let fake;
afterEach(async () => {
  await fake?.close();
  fake = undefined;
});

function run(baseUrl, model = 'llama3.2') {
  let text = '';
  const events = [];
  let handle;
  const done = new Promise((resolve) => {
    handle = runOllama({
      baseUrl,
      model,
      prompt: 'THE PROMPT',
      onText: (t) => (text += t),
      onDone: () => (events.push('done'), resolve()),
      onError: (code, message) => (events.push(`error:${code}`), events.push(message), resolve()),
    });
  });
  return { done, handle, events, getText: () => text };
}

describe('runOllama', () => {
  it('streams the answer of /api/chat, with the prompt as the only user message', async () => {
    fake = await startFakeOllama();
    const r = run(fake.url);
    await r.done;
    expect(r.getText()).toBe('Ola ñandú 🙂');
    expect(r.events).toEqual(['done']);
    const chat = fake.requests.find((q) => q.url === '/api/chat');
    expect(chat.body).toMatchObject({ model: 'llama3.2', stream: true, messages: [{ role: 'user', content: 'THE PROMPT' }] });
    expect(chat.body).not.toHaveProperty('tools');
  });

  it('reports ollama_model_missing with Ollama message for a model that is not pulled', async () => {
    fake = await startFakeOllama({ models: ['qwen3:latest'] });
    const r = run(fake.url, 'llama3.2');
    await r.done;
    expect(r.events[0]).toBe('error:ollama_model_missing');
    expect(r.events[1]).toContain('not found');
  });

  it('reports ollama_missing when nothing listens', async () => {
    fake = await startFakeOllama();
    const url = fake.url;
    await fake.close();
    fake = undefined;
    const r = run(url);
    await r.done;
    expect(r.events[0]).toBe('error:ollama_missing');
  });

  it('reports an error line in the stream as provider_failed, keeping the text so far', async () => {
    fake = await startFakeOllama({ failAfter: true });
    const r = run(fake.url);
    await r.done;
    expect(r.getText()).toBe('Ola ñandú 🙂');
    expect(r.events.slice(0, 2)).toEqual(['error:provider_failed', 'model runner crashed']);
  });

  it('stops quietly when cancelled', async () => {
    fake = await startFakeOllama({ hang: true });
    const r = run(fake.url);
    await new Promise((resolve) => setTimeout(resolve, 100));
    r.handle.cancel();
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(r.events).toEqual([]);
  });
});

describe('checkOllama', () => {
  it('lists the installed models', async () => {
    fake = await startFakeOllama({ models: ['llama3.2:latest', 'qwen3:4b'] });
    expect(await checkOllama(fake.url)).toEqual({ found: true, models: ['llama3.2:latest', 'qwen3:4b'] });
  });

  it('reports not found when Ollama does not answer', async () => {
    expect(await checkOllama('http://127.0.0.1:9')).toEqual({ found: false, models: [] });
  });
});

describe('ollamaBaseUrl', () => {
  it.each([
    [undefined, 'http://127.0.0.1:11434'],
    ['', 'http://127.0.0.1:11434'],
    ['127.0.0.1:11500', 'http://127.0.0.1:11500'],
    ['0.0.0.0', 'http://127.0.0.1:11434'],
    ['http://ollama.lan:8080/', 'http://ollama.lan:8080'],
    ['https://example.com', 'https://example.com'],
  ])('reads OLLAMA_HOST %j as %j', (value, expected) => {
    expect(ollamaBaseUrl(value)).toBe(expected);
  });
});
