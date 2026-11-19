import { browser } from 'wxt/browser';

/** Localized UI string; falls back to the key so a missing message is visible, not blank. */
export function t(key: string): string {
  try {
    return browser.i18n.getMessage(key as any) || key;
  } catch {
    return key;
  }
}
