import { pingHost, summarizeWithHost } from './native';
import type { Provider } from './types';

// Ollama runs models on this computer. The local host talks to its HTTP API, so the extension
// needs no host permission and Ollama no CORS setting, and the page text never leaves the machine.
export const ollamaProvider: Provider = {
  id: 'ollama',
  label: 'Ollama',
  async checkAvailability() {
    const pong = await pingHost({ ollama: true });
    if (!pong) return { ok: false, code: 'host_missing' };
    // A host from before Ollama support does not answer about it; installing again updates it.
    if (pong.ollamaFound !== true) return { ok: false, code: 'ollama_missing' };
    return { ok: true };
  },
  summarize(prompt, model, signal) {
    return summarizeWithHost('ollama', prompt, model, signal);
  },
};
