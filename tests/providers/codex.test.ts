import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { codexProvider } from '@/providers/codex';
import { getProvider } from '@/providers';
import { mockConnectNative } from './fake-native';

async function collect(iterable: AsyncIterable<string>) {
  const out: string[] = [];
  for await (const c of iterable) out.push(c);
  return out;
}

beforeEach(() => fakeBrowser.reset());

describe('codexProvider', () => {
  it('is registered', () => {
    expect(getProvider('codex')).toBe(codexProvider);
  });

  it('is available when the host finds codex', async () => {
    mockConnectNative((_m, p) => p.emit({ type: 'pong', version: '0.1.0', claudeFound: false, codexFound: true }));
    expect(await codexProvider.checkAvailability()).toEqual({ ok: true });
  });

  it('reports codex_missing when the host cannot find codex', async () => {
    mockConnectNative((_m, p) => p.emit({ type: 'pong', version: '0.1.0', claudeFound: true, codexFound: false }));
    expect(await codexProvider.checkAvailability()).toEqual({ ok: false, code: 'codex_missing' });
  });

  it('reports host_missing when the host is not installed', async () => {
    mockConnectNative((_m, p) => p.drop('Specified native messaging host not found.'));
    expect(await codexProvider.checkAvailability()).toEqual({ ok: false, code: 'host_missing' });
  });

  it('sends a codex request and yields its text', async () => {
    const ports = mockConnectNative((m, p) => {
      p.emit({ type: 'chunk', id: m.id, text: 'Summary' });
      p.emit({ type: 'done', id: m.id });
    });
    expect(await collect(codexProvider.summarize('p', 'gpt-6-luna', new AbortController().signal))).toEqual(['Summary']);
    expect(ports[0]!.posted[0]).toMatchObject({ provider: 'codex', model: 'gpt-6-luna' });
  });

  it.each(['codex_missing', 'codex_signed_out', 'usage_limit'])('passes the host error %s through', async (code) => {
    mockConnectNative((m, p) => p.emit({ type: 'error', id: m.id, code }));
    await expect(collect(codexProvider.summarize('p', 'm', new AbortController().signal))).rejects.toMatchObject({ code });
  });
});
