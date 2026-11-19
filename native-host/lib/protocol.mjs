export const HOST_NAME = 'com.browse_resume_ai.host';
export const EXTENSION_ID = 'pdokiakaaeffjlabmofdppjakdhaimpi';
export const VERSION = '0.1.0';
export const MODEL_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._\[\]-]{0,63}$/;
export const PROVIDERS = ['claude'];

/** Returns null when the message is a valid request, otherwise a reason. */
export function validateRequest(msg) {
  if (!msg || typeof msg !== 'object') return 'not an object';
  if (msg.type === 'ping') return null;
  if (typeof msg.id !== 'string' || !msg.id || msg.id.length > 100) return 'missing id';
  if (msg.type === 'cancel') return null;
  if (msg.type !== 'summarize') return 'unknown type';
  if (!PROVIDERS.includes(msg.provider)) return 'unknown provider';
  if (typeof msg.model !== 'string' || !MODEL_PATTERN.test(msg.model)) return 'invalid model';
  if (typeof msg.prompt !== 'string' || !msg.prompt) return 'missing prompt';
  return null;
}
