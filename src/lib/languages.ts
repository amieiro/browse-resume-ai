import { LANGUAGES, type Language } from './language-list';

export { LANGUAGES, type Language };

/** A BCP 47 code from LANGUAGES, e.g. "gl-ES", "pt-BR", "ja". */
export type LanguageCode = string;

const BY_CODE = new Map(LANGUAGES.map((l) => [l.code.toLowerCase(), l]));

/** Variant chosen when only the base language is known ("en" -> "en-US"). */
const PREFERRED: Record<string, string> = { en: 'en-US', zh: 'zh-CN' };

export function isLanguageCode(value: string): boolean {
  return BY_CODE.has(value.toLowerCase());
}

export function languageName(code: LanguageCode): string {
  return BY_CODE.get(code.toLowerCase())?.name ?? 'English';
}

export function isRtl(code: LanguageCode): boolean {
  return BY_CODE.get(code.toLowerCase())?.rtl === true;
}

/** Maps a browser language tag or an old setting ("gl", "pt_BR", "es-419") to a code in the list. */
export function matchLanguage(tag: string): LanguageCode | null {
  const normalized = tag.trim().replace(/_/g, '-').toLowerCase();
  if (!normalized) return null;
  const exact = BY_CODE.get(normalized);
  if (exact) return exact.code;

  const base = normalized.split('-')[0]!;
  const candidates = LANGUAGES.filter((l) => {
    const code = l.code.toLowerCase();
    return code === base || code.startsWith(`${base}-`);
  });
  if (candidates.length === 0) return null;
  const preferred = PREFERRED[base] ?? `${base}-${base}`;
  return (
    candidates.find((l) => l.code.toLowerCase() === preferred.toLowerCase()) ??
    candidates.find((l) => l.code.toLowerCase() === base) ??
    candidates[0]!
  ).code;
}
