import { browser } from 'wxt/browser';
import { catalogDeps } from '@/lib/catalog-deps';
import { applyDisplayMode } from '@/lib/display-mode';
import { extractFromTab, selectionFromTab } from '@/lib/injection';
import { menuTitles } from '@/lib/menu-strings';
import { ensureFreshCatalog, refreshCatalog } from '@/lib/model-catalog';
import { parsePortName, type BackgroundToUi, type SummaryStartedBroadcast, type UiToBackground } from '@/lib/messages';
import { loadSettings, type DisplayMode } from '@/lib/settings';
import { Summarizer } from '@/lib/summarizer';
import { getProvider } from '@/providers';

const MENU_SELECTION = 'summarize-selection';
const MENU_PAGE = 'summarize-page';

export default defineBackground(() => {
  const summarizer = new Summarizer({ extract: extractFromTab, extractSelection: selectionFromTab, loadSettings, getProvider });

  // Kept in memory so a menu click can open the right view at once: the side panel only opens
  // inside the click gesture, before anything is awaited.
  let displayMode: DisplayMode = 'sidepanel';
  // Runs one at a time: install, startup and the first load can overlap, and two removeAll/create
  // rounds interleaved would try to create the same menu twice.
  let syncing = Promise.resolve();
  const syncSettings = () => {
    syncing = syncing.then(async () => {
      const settings = await loadSettings();
      displayMode = settings.displayMode;
      await applyDisplayMode(displayMode);
      const titles = menuTitles(settings.uiLanguage, browser.i18n.getUILanguage());
      await browser.contextMenus.removeAll();
      browser.contextMenus.create({ id: MENU_SELECTION, title: titles.selection, contexts: ['selection'] });
      browser.contextMenus.create({ id: MENU_PAGE, title: titles.page, contexts: ['page'] });
    }).catch(() => {});
    return syncing;
  };
  // The model lists are read again when the extension is installed or updated, and checked when
  // Chrome starts and whenever a view opens (once a day, or when Claude Code or Codex changed).
  browser.runtime.onInstalled.addListener(() => {
    void syncSettings();
    void refreshCatalog(catalogDeps());
  });
  browser.runtime.onStartup.addListener(() => {
    void syncSettings();
    void ensureFreshCatalog(catalogDeps());
  });
  browser.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && 'settings' in changes) void syncSettings();
  });
  void syncSettings();

  /** Opens the summary view for a tab; must run inside the user gesture, before any await. */
  const openView = (tabId: number) => {
    if (displayMode === 'popup') browser.action.openPopup().catch(() => {});
    else browser.sidePanel.open({ tabId }).catch(() => {});
  };
  const announce = (tabId: number) => {
    const started: SummaryStartedBroadcast = { type: 'summary-started', tabId };
    browser.runtime.sendMessage(started).catch(() => {});
  };

  // Fires only in side panel mode (no popup set): a click on the icon or the keyboard shortcut.
  browser.action.onClicked.addListener((tab) => {
    if (tab.id === undefined) return;
    browser.sidePanel.open({ tabId: tab.id }).catch(() => {});
    void summarizer.start(tab.id, { force: false });
    announce(tab.id);
  });

  browser.contextMenus.onClicked.addListener((info, tab) => {
    if (tab?.id === undefined) return;
    openView(tab.id);
    if (info.menuItemId === MENU_SELECTION) {
      void summarizer.startSelection(tab.id, {
        url: info.pageUrl ?? tab.url ?? '',
        title: tab.title ?? '',
        selectionText: info.selectionText ?? '',
        frameId: info.frameId,
      });
    } else {
      void summarizer.start(tab.id, { force: false });
    }
    announce(tab.id);
  });

  browser.runtime.onConnect.addListener((port) => {
    const tabId = parsePortName(port.name);
    if (tabId === null) return;
    const unsubscribe = summarizer.subscribe(tabId, (state) => {
      port.postMessage({ type: 'state', state } satisfies BackgroundToUi);
    });
    port.onMessage.addListener((msg: UiToBackground) => {
      if (msg?.type === 'start') void summarizer.start(tabId, { force: msg.force === true });
      else if (msg?.type === 'ask' && typeof msg.question === 'string') void summarizer.ask(tabId, msg.question);
    });
    // The request keeps running when the UI closes; only the subscription ends.
    port.onDisconnect.addListener(unsubscribe);
  });

  browser.tabs.onRemoved.addListener((tabId) => summarizer.forget(tabId));
});
