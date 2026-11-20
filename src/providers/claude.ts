import { pingHost, summarizeWithHost } from './native';
import type { Provider } from './types';

export const claudeProvider: Provider = {
  id: 'claude',
  label: 'Claude',
  async checkAvailability() {
    const pong = await pingHost();
    if (!pong) return { ok: false, code: 'host_missing' };
    if (pong.claudeFound !== true) return { ok: false, code: 'claude_missing' };
    return { ok: true };
  },
  summarize(prompt, model, signal, onUsage) {
    return summarizeWithHost('claude', prompt, model, signal, onUsage);
  },
};
