import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { ollamaProvider } from '@/providers/ollama';
import { getProvider } from '@/providers';
import { mockConnectNative } from './fake-native';

async function collect(iterable: AsyncIterable<string>) {
  const out: string[] = [];
  for await (const c of iterable) out.push(c);
  return out;
}

beforeEach(() => fakeBrowser.reset());

describe('ollamaProvider', () => {
  it('is registered', () => {
    expect(getProvider('ollama')).toBe(ollamaProvider);
  });

  it('asks the host to check Ollama, and is available when it answers', async () => {
    const ports = mockConnectNative((_m, p) => p.emit({ type: 'pong', version: '0.6.0', ollamaFound: true, ollamaModels: ['llama3.2:latest'] }));
    expect(await ollamaProvider.checkAvailability()).toEqual({ ok: true });
    expect(ports[0]!.posted[0]).toEqual({ type: 'ping', ollama: true });
  });

  it('reports ollama_missing when Ollama is not running', async () => {
    mockConnectNative((_m, p) => p.emit({ type: 'pong', version: '0.6.0', ollamaFound: false, ollamaModels: [] }));
    expect(await ollamaProvider.checkAvailability()).toEqual({ ok: false, code: 'ollama_missing' });
  });

  it('reports host_missing when the host is not installed', async () => {
    mockConnectNative((_m, p) => p.drop('Specified native messaging host not found.'));
    expect(await ollamaProvider.checkAvailability()).toEqual({ ok: false, code: 'host_missing' });
  });

  it('reports ollama_missing for a host from before Ollama support (no answer about it)', async () => {
    mockConnectNative((_m, p) => p.emit({ type: 'pong', version: '0.5.0', claudeFound: true, codexFound: true }));
    expect(await ollamaProvider.checkAvailability()).toEqual({ ok: false, code: 'ollama_missing' });
  });

  it('sends an ollama request and yields its text', async () => {
    const ports = mockConnectNative((m, p) => {
      p.emit({ type: 'chunk', id: m.id, text: 'Summary' });
      p.emit({ type: 'done', id: m.id });
    });
    expect(await collect(ollamaProvider.summarize('p', 'llama3.2:3b', new AbortController().signal))).toEqual(['Summary']);
    expect(ports[0]!.posted[0]).toMatchObject({ provider: 'ollama', model: 'llama3.2:3b' });
  });

  it.each(['ollama_missing', 'ollama_model_missing'])('passes the host error %s through, with its detail', async (code) => {
    mockConnectNative((m, p) => p.emit({ type: 'error', id: m.id, code, message: 'model "x" not found' }));
    await expect(collect(ollamaProvider.summarize('p', 'x', new AbortController().signal))).rejects.toMatchObject({
      code,
      message: 'model "x" not found',
    });
  });
});
