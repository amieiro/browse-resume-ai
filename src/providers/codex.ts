import { pingHost, summarizeWithHost } from './native';
import type { Provider } from './types';

// Codex runs through the local host with `codex exec`: Sign in with ChatGPT only accepts loopback
// redirects, which an extension cannot receive.
export const codexProvider: Provider = {
  id: 'codex',
  label: 'Codex',
  async checkAvailability() {
    const pong = await pingHost();
    if (!pong) return { ok: false, code: 'host_missing' };
    if (pong.codexFound !== true) return { ok: false, code: 'codex_missing' };
    return { ok: true };
  },
  summarize(prompt, model, signal) {
    return summarizeWithHost('codex', prompt, model, signal);
  },
};
