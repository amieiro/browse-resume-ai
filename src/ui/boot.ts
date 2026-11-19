import { browser } from 'wxt/browser';
import { initI18n, resolveUiLanguage } from '@/lib/i18n';
import { loadSettings, type Settings } from '@/lib/settings';

/**
 * Loads the settings and the interface strings for an extension page, and reloads the page when
 * the interface language changes (strings are read once, at mount).
 */
export async function bootPage(): Promise<Settings> {
  const settings = await loadSettings();
  await initI18n(resolveUiLanguage(settings.uiLanguage, browser.i18n.getUILanguage()));
  browser.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !('settings' in changes)) return;
    void loadSettings().then((next) => {
      if (next.uiLanguage !== settings.uiLanguage) location.reload();
    });
  });
  return settings;
}
