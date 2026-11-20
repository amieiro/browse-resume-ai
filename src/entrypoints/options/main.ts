import { browser } from 'wxt/browser';
import { t } from '@/lib/i18n';
import { saveSettings } from '@/lib/settings';
import { getProvider } from '@/providers';
import { bootPage } from '@/ui/boot';
import { mountOptionsView } from '@/ui/options-view';

async function main() {
  const settings = await bootPage();
  document.title = t('options_title');
  mountOptionsView(document.getElementById('app')!, settings, {
    onSave: (patch) => void saveSettings(patch),
    checkAvailability: (id) => getProvider(id).checkAvailability(),
    version: browser.runtime.getManifest().version,
  });
}

void main();
