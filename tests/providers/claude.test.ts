import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { claudeProvider } from '@/providers/claude';
import { SummaryError } from '@/providers/types';
import { mockConnectNative } from './fake-native';

async function collect(iterable: AsyncIterable<string>) {
  const out: string[] = [];
  for await (const c of iterable) out.push(c);
  return out;
}

beforeEach(() => {
  fakeBrowser.reset();
  vi.useRealTimers();
});

describe('claudeProvider.checkAvailability', () => {
  it('is ok when the host finds claude', async () => {
    mockConnectNative((m, p) => m.type === 'ping' && p.emit({ type: 'pong', version: '0.1.0', claudeFound: true }));
    expect(await claudeProvider.checkAvailability()).toEqual({ ok: true });
  });

  it('reports claude_missing when the host cannot find claude', async () => {
    mockConnectNative((m, p) => p.emit({ type: 'pong', version: '0.1.0', claudeFound: false }));
    expect(await claudeProvider.checkAvailability()).toEqual({ ok: false, code: 'claude_missing' });
  });

  it('reports host_missing when the host is not installed', async () => {
    mockConnectNative((_m, p) => p.drop('Specified native messaging host not found.'));
    expect(await claudeProvider.checkAvailability()).toEqual({ ok: false, code: 'host_missing' });
  });

  it('reports host_missing when the host does not answer in 3 seconds', async () => {
    vi.useFakeTimers();
    const ports = mockConnectNative(() => {});
    const result = claudeProvider.checkAvailability();
    await vi.advanceTimersByTimeAsync(3000);
    expect(await result).toEqual({ ok: false, code: 'host_missing' });
    expect(ports[0]!.disconnected).toBe(true);
  });
});

describe('claudeProvider.summarize', () => {
  it('yields chunks until done and disconnects', async () => {
    const ports = mockConnectNative((m, p) => {
      if (m.type !== 'summarize') return;
      p.emit({ type: 'chunk', id: 'other', text: 'ignored' });
      p.emit({ type: 'chunk', id: m.id, text: 'a' });
      p.emit({ type: 'chunk', id: m.id, text: 'b' });
      p.emit({ type: 'done', id: m.id });
    });
    expect(await collect(claudeProvider.summarize('prompt', 'sonnet', new AbortController().signal))).toEqual(['a', 'b']);
    expect(ports[0]!.posted[0]).toMatchObject({ type: 'summarize', provider: 'claude', model: 'sonnet', prompt: 'prompt' });
    expect(ports[0]!.disconnected).toBe(true);
  });

  it('throws the host error code', async () => {
    mockConnectNative((m, p) => p.emit({ type: 'error', id: m.id, code: 'claude_auth', message: 'Not logged in' }));
    await expect(collect(claudeProvider.summarize('p', 'sonnet', new AbortController().signal))).rejects.toMatchObject({
      code: 'claude_auth',
    });
  });

  it('maps an unknown host error code to provider_failed', async () => {
    mockConnectNative((m, p) => p.emit({ type: 'error', id: m.id, code: 'bad_request', message: 'invalid model' }));
    await expect(collect(claudeProvider.summarize('p', 'sonnet', new AbortController().signal))).rejects.toMatchObject({
      code: 'provider_failed',
    });
  });

  it('throws provider_failed when the host disconnects mid-stream', async () => {
    mockConnectNative((m, p) => {
      p.emit({ type: 'chunk', id: m.id, text: 'a' });
      p.drop('Native host has exited.');
    });
    const out: string[] = [];
    const run = async () => {
      for await (const c of claudeProvider.summarize('p', 'sonnet', new AbortController().signal)) out.push(c);
    };
    await expect(run()).rejects.toBeInstanceOf(SummaryError);
    expect(out).toEqual(['a']);
  });

  it('throws host_missing when the host is not installed', async () => {
    mockConnectNative((_m, p) => p.drop('Specified native messaging host not found.'));
    await expect(collect(claudeProvider.summarize('p', 'sonnet', new AbortController().signal))).rejects.toMatchObject({
      code: 'host_missing',
    });
  });

  it('on abort posts cancel, disconnects and ends quietly', async () => {
    const controller = new AbortController();
    const ports = mockConnectNative((m, p) => {
      if (m.type === 'summarize') p.emit({ type: 'chunk', id: m.id, text: 'a' });
    });
    const out: string[] = [];
    for await (const c of claudeProvider.summarize('p', 'sonnet', controller.signal)) {
      out.push(c);
      controller.abort();
    }
    expect(out).toEqual(['a']);
    const id = ports[0]!.posted[0].id;
    expect(ports[0]!.posted).toContainEqual({ type: 'cancel', id });
    expect(ports[0]!.disconnected).toBe(true);
  });
});
