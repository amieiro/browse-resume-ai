import { browser } from 'wxt/browser';
import { t } from '@/lib/i18n';
import { catalogDeps } from '@/lib/catalog-deps';
import { ensureFreshCatalog, getCatalog, refreshCatalog } from '@/lib/model-catalog';
import { baseModels, loadStoredSettings, saveSettings } from '@/lib/settings';
import { getProvider } from '@/providers';
import { bootPage } from '@/ui/boot';
import { mountOptionsView } from '@/ui/options-view';

async function main() {
  const settings = await bootPage();
  document.title = t('options_title');
  const before = await getCatalog();
  const catalog = await ensureFreshCatalog(catalogDeps());
  // Lists read just now (the first time, or after a day or a CLI update): show them.
  if (catalog && catalog.checkedAt !== before?.checkedAt) {
    location.reload();
    return;
  }
  const stored = await loadStoredSettings();
  mountOptionsView(document.getElementById('app')!, settings, {
    onSave: (patch) => void saveSettings(patch),
    checkAvailability: (id) => getProvider(id).checkAvailability(),
    version: browser.runtime.getManifest().version,
    baseModels: (id) => baseModels(stored, catalog, id),
    modelsCheckedAt: catalog?.checkedAt ?? null,
    onOpenHistory: () => void browser.tabs.create({ url: browser.runtime.getURL('/history.html') }),
    onRefreshModels: async () => {
      await refreshCatalog(catalogDeps());
      location.reload();
    },
  });
}

void main();
