import { browser } from 'wxt/browser';
import { clearHistory, deleteFromHistory, getHistory, HISTORY_KEY } from '@/lib/history';
import { t } from '@/lib/i18n';
import { bootPage } from '@/ui/boot';
import { mountHistoryView } from '@/ui/history-view';

async function main() {
  await bootPage();
  document.title = t('history_title');
  const view = mountHistoryView(document.getElementById('app')!, await getHistory(), {
    onDelete: (id) => void deleteFromHistory(id),
    onClear: () => void clearHistory(),
    onCopy: (text) => navigator.clipboard.writeText(text),
  });
  // Summaries made while the page is open appear at once.
  browser.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && HISTORY_KEY in changes) void getHistory().then(view.setEntries);
  });
}

void main();
