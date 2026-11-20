// Ollama runs models on this computer and serves them over HTTP (by default on 127.0.0.1:11434).
// The host talks to it with fetch, so the extension needs no extra permission and Ollama no CORS
// setting. Only /api/chat is used, with the prompt as a single user message and no tools: the page
// text is untrusted and the model must not be able to do anything but write text.

import { ollamaUsage } from './usage.mjs';

const DEFAULT_PORT = 11434;
const CHECK_TIMEOUT_MS = 1500;

/** The base URL for OLLAMA_HOST, read the way Ollama reads it ("host:port", scheme optional). */
export function ollamaBaseUrl(value = process.env.OLLAMA_HOST) {
  const raw = (value ?? '').trim();
  if (!raw) return `http://127.0.0.1:${DEFAULT_PORT}`;
  let url;
  try {
    url = new URL(/^[a-z]+:\/\//i.test(raw) ? raw : `http://${raw}`);
  } catch {
    return `http://127.0.0.1:${DEFAULT_PORT}`;
  }
  // 0.0.0.0 is where a server listens on every interface; a client reaches it on the loopback.
  const host = url.hostname === '0.0.0.0' ? '127.0.0.1' : url.hostname;
  const port = url.port || (/^[a-z]+:\/\//i.test(raw) ? '' : String(DEFAULT_PORT));
  return `${url.protocol}//${host}${port ? `:${port}` : ''}`;
}

/** Whether Ollama answers, and the models it has. */
export async function checkOllama(baseUrl = ollamaBaseUrl()) {
  try {
    const res = await fetch(`${baseUrl}/api/tags`, { signal: AbortSignal.timeout(CHECK_TIMEOUT_MS) });
    if (!res.ok) return { found: false, models: [] };
    const body = await res.json();
    return { found: true, models: (body.models ?? []).map((m) => m.name ?? m.model).filter(Boolean) };
  } catch {
    return { found: false, models: [] };
  }
}

/** onError codes: ollama_missing, ollama_model_missing, provider_failed. Returns { cancel }. */
export function runOllama({ baseUrl = ollamaBaseUrl(), model, prompt, onText, onDone, onError }) {
  const controller = new AbortController();
  let settled = false;
  const finish = (fn) => {
    if (settled || controller.signal.aborted) return;
    settled = true;
    fn();
  };

  (async () => {
    let res;
    try {
      res = await fetch(`${baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ model, stream: true, messages: [{ role: 'user', content: prompt }] }),
        signal: controller.signal,
      });
    } catch (error) {
      finish(() => onError('ollama_missing', error?.cause?.code ?? error?.message ?? 'Ollama did not answer'));
      return;
    }
    if (!res.ok) {
      const detail = await res.text().then((t) => {
        try {
          return JSON.parse(t).error ?? t;
        } catch {
          return t;
        }
      }, () => '');
      const code = res.status === 404 && /not found/i.test(detail) ? 'ollama_model_missing' : 'provider_failed';
      finish(() => onError(code, detail || `HTTP ${res.status}`));
      return;
    }

    const decoder = new TextDecoder();
    let buffer = '';
    const handleLine = (line) => {
      if (!line.trim()) return false;
      let event;
      try {
        event = JSON.parse(line);
      } catch {
        return false;
      }
      if (event.error) {
        finish(() => onError('provider_failed', String(event.error)));
        return true;
      }
      const text = event.message?.content;
      if (text && !settled && !controller.signal.aborted) onText(text);
      if (event.done) {
        finish(() => onDone(ollamaUsage(event)));
        return true;
      }
      return false;
    };
    try {
      for await (const bytes of res.body) {
        buffer += decoder.decode(bytes, { stream: true });
        let newline;
        while ((newline = buffer.indexOf('\n')) !== -1) {
          const line = buffer.slice(0, newline);
          buffer = buffer.slice(newline + 1);
          if (handleLine(line)) return;
        }
      }
      buffer += decoder.decode();
      if (handleLine(buffer)) return;
      finish(() => onError('provider_failed', 'Ollama closed the answer before the end'));
    } catch (error) {
      finish(() => onError('provider_failed', error?.message ?? String(error)));
    }
  })();

  return {
    cancel() {
      controller.abort();
    },
  };
}
