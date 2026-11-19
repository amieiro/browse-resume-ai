export type LanguageCode = 'gl' | 'es' | 'en' | 'pt' | 'fr' | 'de' | 'it' | 'ca' | 'eu';

export interface Language {
  code: LanguageCode;
  /** English name, used in the prompt. */
  name: string;
  /** Name in the language itself, shown in the UI. */
  nativeName: string;
}

export const LANGUAGES: Language[] = [
  { code: 'gl', name: 'Galician', nativeName: 'Galego' },
  { code: 'es', name: 'Spanish', nativeName: 'Español' },
  { code: 'en', name: 'English', nativeName: 'English' },
  { code: 'pt', name: 'Portuguese', nativeName: 'Português' },
  { code: 'fr', name: 'French', nativeName: 'Français' },
  { code: 'de', name: 'German', nativeName: 'Deutsch' },
  { code: 'it', name: 'Italian', nativeName: 'Italiano' },
  { code: 'ca', name: 'Catalan', nativeName: 'Català' },
  { code: 'eu', name: 'Basque', nativeName: 'Euskara' },
];

export function isLanguageCode(value: string): value is LanguageCode {
  return LANGUAGES.some((l) => l.code === value);
}

export function languageName(code: LanguageCode): string {
  return LANGUAGES.find((l) => l.code === code)?.name ?? 'English';
}
