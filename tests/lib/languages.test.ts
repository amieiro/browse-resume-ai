import { describe, expect, it } from 'vitest';
import { isRtl, languageName, LANGUAGES, matchLanguage } from '@/lib/languages';

describe('language list', () => {
  it('has the 201 translate.wordpress.org languages with unique BCP 47 codes', () => {
    expect(LANGUAGES.length).toBe(201);
    expect(new Set(LANGUAGES.map((l) => l.code)).size).toBe(201);
    for (const l of LANGUAGES) expect(l.code).toMatch(/^[a-z]{2,3}(-[A-Z]{2})?(-[a-z0-9]{5,8}|-x-[a-z]+)?$/);
  });

  it('uses ISO names and codes', () => {
    expect(languageName('gl-ES')).toBe('Galician');
    expect(languageName('el')).toBe('Modern Greek');
    expect(languageName('cnr-ME')).toBe('Montenegrin');
    expect(LANGUAGES.some((l) => l.code.startsWith('art'))).toBe(false);
  });

  it('marks right-to-left languages', () => {
    expect(isRtl('ar')).toBe(true);
    expect(isRtl('he-IL')).toBe(true);
    expect(isRtl('gl-ES')).toBe(false);
  });
});

describe('matchLanguage', () => {
  it.each([
    ['gl-ES', 'gl-ES'],
    ['gl', 'gl-ES'],
    ['GL_es', 'gl-ES'],
    ['pt-BR', 'pt-BR'],
    ['pt', 'pt-PT'],
    ['es-419', 'es-ES'],
    ['es', 'es-ES'],
    ['en', 'en-US'],
    ['en-GB', 'en-GB'],
    ['zh', 'zh-CN'],
    ['zh-TW', 'zh-TW'],
    ['nb', 'nb-NO'],
    ['ja', 'ja'],
    ['he', 'he-IL'],
    ['ca', 'ca'],
    ['eu', 'eu'],
  ])('matches %s to %s', (tag, code) => {
    expect(matchLanguage(tag)).toBe(code);
  });

  it('returns null for an unknown language', () => {
    expect(matchLanguage('xx')).toBeNull();
    expect(matchLanguage('')).toBeNull();
  });
});
