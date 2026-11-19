import { loadSettings, saveSettings } from '@/lib/settings';
import { getProvider } from '@/providers';
import { mountOptionsView } from '@/ui/options-view';

async function main() {
  mountOptionsView(document.getElementById('app')!, await loadSettings(), {
    onSave: (patch) => void saveSettings(patch),
    checkAvailability: (id) => getProvider(id).checkAvailability(),
  });
}

void main();
