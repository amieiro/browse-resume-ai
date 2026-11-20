import { browser } from 'wxt/browser';
import type { HostModels } from '@/lib/model-catalog';
import type { ModelPrice } from '@/lib/prices';
import { SummaryError, type SummaryErrorCode, type TokenUsage } from './types';

export const HOST_NAME = 'com.browse_resume_ai.host';
const PING_TIMEOUT_MS = 3000;

type HostMessage =
  | { type: 'pong'; version: string; [key: string]: unknown }
  | { type: 'chunk'; id: string; text: string }
  | { type: 'done'; id: string; usage?: unknown }
  | { type: 'error'; id: string | null; code: string; message?: string };

type NativePort = ReturnType<typeof browser.runtime.connectNative>;

/** Error codes the host may send that the extension shows as they are. */
const PASSTHROUGH: SummaryErrorCode[] = [
  'claude_missing',
  'claude_auth',
  'codex_missing',
  'codex_signed_out',
  'ollama_missing',
  'ollama_model_missing',
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

/**
 * Pings the host. Resolves to the pong, or null when the host is missing or silent. With ollama, the
 * host also checks whether Ollama answers (a network request, so only when asked).
 */
export function pingHost(options: { ollama?: boolean } = {}): Promise<Extract<HostMessage, { type: 'pong' }> | null> {
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
    port.postMessage(options.ollama ? { type: 'ping', ollama: true } : { type: 'ping' });
  });
}

/** Sends one message and resolves to the first answer of the given type, or null (missing, silent). */
function askHost<T>(message: object, answerType: string, timeoutMs: number): Promise<T | null> {
  return new Promise((resolve) => {
    let port: NativePort;
    try {
      port = connect();
    } catch {
      resolve(null);
      return;
    }
    const finish = (value: T | null) => {
      clearTimeout(timer);
      port.disconnect();
      resolve(value);
    };
    const timer = setTimeout(() => finish(null), timeoutMs);
    port.onMessage.addListener((msg: { type: string }) => {
      if (msg.type === answerType) finish(msg as T);
    });
    port.onDisconnect.addListener(() => {
      clearTimeout(timer);
      resolve(null);
    });
    port.postMessage(message);
  });
}

/** The models of every provider, as the host reads them from the CLIs and Ollama. */
export function listModels(): Promise<HostModels | null> {
  return askHost<HostModels>({ type: 'models' }, 'models', 30_000);
}

/** The installed versions of Claude Code and Codex. */
export function cliVersions(): Promise<{ claude: string | null; codex: string | null } | null> {
  return askHost({ type: 'versions' }, 'versions', 30_000);
}

const isCount = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0;

/** The usage the host sent, if it is one. */
export function parseUsage(value: unknown): TokenUsage | null {
  if (!value || typeof value !== 'object') return null;
  const { inputTokens, outputTokens, cachedInputTokens, costUsd } = value as Record<string, unknown>;
  if (!isCount(inputTokens) || !isCount(outputTokens)) return null;
  const usage: TokenUsage = { inputTokens: Math.round(inputTokens), outputTokens: Math.round(outputTokens) };
  if (isCount(cachedInputTokens)) usage.cachedInputTokens = Math.min(Math.round(cachedInputTokens), usage.inputTokens);
  if (isCount(costUsd)) usage.costUsd = costUsd;
  return usage;
}

/** OpenAI API prices per model (dollars per million tokens), downloaded by the host; null if it could not. */
export async function fetchPrices(): Promise<Record<string, ModelPrice> | null> {
  const answer = await askHost<{ openai: unknown }>({ type: 'prices' }, 'prices', 60_000);
  const openai = answer?.openai;
  if (!openai || typeof openai !== 'object') return null;
  const prices: Record<string, ModelPrice> = {};
  for (const [model, value] of Object.entries(openai as Record<string, Record<string, unknown>>)) {
    if (!value || !isCount(value.input) || !isCount(value.output)) continue;
    prices[model] = isCount(value.cachedInput) ? { input: value.input, output: value.output, cachedInput: value.cachedInput } : { input: value.input, output: value.output };
  }
  return Object.keys(prices).length ? prices : null;
}

/** Streams a summary from the host. One port per request; ends quietly when aborted. */
export async function* summarizeWithHost(
  provider: string,
  prompt: string,
  model: string,
  signal: AbortSignal,
  onUsage?: (usage: TokenUsage) => void,
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
    else if (msg.type === 'done') {
      finished = true;
      const usage = parseUsage(msg.usage);
      if (usage) onUsage?.(usage);
    }
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
