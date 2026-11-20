import { readFileSync } from 'node:fs';

export const HOST_NAME = 'com.browse_resume_ai.host';
export const EXTENSION_ID = 'pdokiakaaeffjlabmofdppjakdhaimpi';
/** The project version, from the repository's package.json (the host always runs from the repository). */
export const VERSION = (() => {
  try {
    return JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')).version;
  } catch {
    return 'unknown';
  }
})();
/** Model names passed to the CLIs as an argument: no spaces, no leading dash. */
export const MODEL_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._\[\]-]{0,63}$/;
/**
 * Ollama model names have a tag and may have a namespace ("llama3.2:3b", "hf.co/user/repo:Q4_K_M").
 * They go in a JSON body, never on a command line; ".." is refused all the same.
 */
export const OLLAMA_MODEL_PATTERN = /^(?!.*\.\.)[A-Za-z0-9][A-Za-z0-9._:\/-]{0,199}$/;
export const PROVIDERS = ['claude', 'codex', 'ollama'];

/** Returns null when the message is a valid request, otherwise a reason. */
export function validateRequest(msg) {
  if (!msg || typeof msg !== 'object') return 'not an object';
  if (msg.type === 'ping' || msg.type === 'models' || msg.type === 'versions' || msg.type === 'prices') return null;
  if (typeof msg.id !== 'string' || !msg.id || msg.id.length > 100) return 'missing id';
  if (msg.type === 'cancel') return null;
  if (msg.type !== 'summarize') return 'unknown type';
  if (!PROVIDERS.includes(msg.provider)) return 'unknown provider';
  const pattern = msg.provider === 'ollama' ? OLLAMA_MODEL_PATTERN : MODEL_PATTERN;
  if (typeof msg.model !== 'string' || !pattern.test(msg.model)) return 'invalid model';
  if (typeof msg.prompt !== 'string' || !msg.prompt) return 'missing prompt';
  return null;
}
