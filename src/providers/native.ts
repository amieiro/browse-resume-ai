import { browser } from 'wxt/browser';
import { SummaryError, type SummaryErrorCode } from './types';

export const HOST_NAME = 'com.browse_resume_ai.host';
const PING_TIMEOUT_MS = 3000;

type HostMessage =
  | { type: 'pong'; version: string; [key: string]: unknown }
  | { type: 'chunk'; id: string; text: string }
  | { type: 'done'; id: string }
  | { type: 'error'; id: string | null; code: string; message?: string };

type NativePort = ReturnType<typeof browser.runtime.connectNative>;

/** Error codes the host may send that the extension shows as they are. */
const PASSTHROUGH: SummaryErrorCode[] = [
  'claude_missing',
  'claude_auth',
  'codex_missing',
  'codex_signed_out',
  'usage_limit',
  'provider_failed',
];

function connect(): NativePort {
  return browser.runtime.connectNative(HOST_NAME);
}

function disconnectCode(): SummaryErrorCode {
  const message = browser.runtime.lastError?.message ?? '';
  return /not found|forbidden/i.test(message) ? 'host_missing' : 'provider_failed';
}

/** Pings the host. Resolves to the pong, or null when the host is missing or silent. */
export function pingHost(): Promise<Extract<HostMessage, { type: 'pong' }> | null> {
  return new Promise((resolve) => {
    let port: NativePort;
    try {
      port = connect();
    } catch {
      resolve(null);
      return;
    }
    const finish = (value: Extract<HostMessage, { type: 'pong' }> | null) => {
      clearTimeout(timer);
      port.disconnect();
      resolve(value);
    };
    const timer = setTimeout(() => finish(null), PING_TIMEOUT_MS);
    port.onMessage.addListener((msg: HostMessage) => {
      if (msg.type === 'pong') finish(msg);
    });
    port.onDisconnect.addListener(() => {
      clearTimeout(timer);
      resolve(null);
    });
    port.postMessage({ type: 'ping' });
  });
}

/** Streams a summary from the host. One port per request; ends quietly when aborted. */
export async function* summarizeWithHost(
  provider: string,
  prompt: string,
  model: string,
  signal: AbortSignal,
): AsyncGenerator<string> {
  if (signal.aborted) return;
  const id = crypto.randomUUID();
  const port = connect();
  const queue: string[] = [];
  let finished = false;
  let failure: SummaryError | null = null;
  let wake: (() => void) | null = null;
  const notify = () => {
    wake?.();
    wake = null;
  };

  port.onMessage.addListener((msg: HostMessage) => {
    if (finished || !('id' in msg) || msg.id !== id) return;
    if (msg.type === 'chunk') queue.push(msg.text);
    else if (msg.type === 'done') finished = true;
    else if (msg.type === 'error') {
      finished = true;
      const code = PASSTHROUGH.includes(msg.code as SummaryErrorCode) ? (msg.code as SummaryErrorCode) : 'provider_failed';
      failure = new SummaryError(code, msg.message);
    }
    notify();
  });
  port.onDisconnect.addListener(() => {
    if (!finished) {
      finished = true;
      failure = new SummaryError(disconnectCode());
    }
    notify();
  });
  const onAbort = () => {
    if (!finished) port.postMessage({ type: 'cancel', id });
    finished = true;
    notify();
  };
  signal.addEventListener('abort', onAbort, { once: true });

  try {
    port.postMessage({ type: 'summarize', id, provider, model, prompt });
    while (true) {
      while (queue.length > 0) {
        if (signal.aborted) return;
        yield queue.shift()!;
      }
      if (signal.aborted) return;
      if (finished) {
        if (failure) throw failure;
        return;
      }
      await new Promise<void>((resolve) => (wake = resolve));
    }
  } finally {
    signal.removeEventListener('abort', onAbort);
    port.disconnect();
  }
}
