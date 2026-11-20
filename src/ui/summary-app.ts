import { browser } from 'wxt/browser';
import type { SummaryStartedBroadcast } from '@/lib/messages';
import { catalogDeps } from '@/lib/catalog-deps';
import { CATALOG_KEY, ensureFreshCatalog } from '@/lib/model-catalog';
import { priceDeps } from '@/lib/price-deps';
import { ensureFreshPrices } from '@/lib/prices';
import { loadSettings, saveSettings } from '@/lib/settings';
import { siteHost, sitePattern } from '@/lib/site-access';
import type { SummaryState } from '@/lib/summarizer';
import { bootPage } from './boot';
import { createPortClient } from './port-client';
import { mountSummaryView } from './summary-view';

interface Options {
  /** Popup: ask for a summary as soon as it opens. The side panel is started by the icon click. */
  startOnOpen: boolean;
  /** Side panel: follow the active tab of its window. */
  followActiveTab: boolean;
}

async function activeTabId(): Promise<number | undefined> {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  return tab?.id;
}

export async function startSummaryApp(root: HTMLElement, options: Options): Promise<void> {
  // The page of the tab's last summary: after the tab goes to another page of the same site, the
  // view offers to allow the site (the extension cannot see the new address without access).
  let lastUrl: string | undefined;
  let allowCheck = 0;
  const onState = (state: SummaryState) => {
    if (state.status !== 'idle' && state.url) lastUrl = state.url;
    view.setState(state);
    const pattern = state.status === 'error' && state.code === 'needs_click' ? sitePattern(lastUrl) : null;
    const check = ++allowCheck;
    if (!pattern) return view.setAllowSite(null);
    // Already allowed: the tab is on another site, and only a click on the icon helps.
    void browser.permissions.contains({ origins: [pattern] }).then(
      (allowed) => check === allowCheck && view.setAllowSite(allowed ? null : siteHost(lastUrl!)),
      () => check === allowCheck && view.setAllowSite(null),
    );
  };
  const client = createPortClient((name) => browser.runtime.connect({ name }), onState);

  const view = mountSummaryView(root, await bootPage(), {
    onRegenerate: () => client.send({ type: 'start', force: true }),
    onSettingsChange: (patch) => void saveSettings(patch),
    onOpenOptions: () => void browser.runtime.openOptionsPage(),
    onAsk: (question) => client.send({ type: 'ask', question }),
    onOpenHistory: () => void browser.tabs.create({ url: browser.runtime.getURL('/summary-history.html') }),
    onAllowSite: () => {
      const pattern = sitePattern(lastUrl);
      if (!pattern) return;
      // Asked at once, inside the click: browsers only show the prompt for a user gesture.
      void browser.permissions.request({ origins: [pattern] }).then((granted) => {
        if (granted) client.send({ type: 'start', force: true });
      }, () => {});
    },
  });

  browser.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && ('settings' in changes || CATALOG_KEY in changes)) void loadSettings().then(view.setSettings);
  });

  // An icon click while the service worker slept: our port is dead, reopen it to see the new summary.
  browser.runtime.onMessage.addListener((msg: SummaryStartedBroadcast) => {
    if (msg?.type === 'summary-started' && msg.tabId === client.tabId()) client.ensureConnected();
  });

  void ensureFreshCatalog(catalogDeps());
  void ensureFreshPrices(priceDeps());

  const tabId = await activeTabId();
  if (tabId === undefined) return;
  client.attach(tabId);
  if (options.startOnOpen) client.send({ type: 'start', force: false });

  if (options.followActiveTab) {
    const { id: windowId } = await browser.windows.getCurrent();
    browser.tabs.onActivated.addListener((info) => {
      if (info.windowId !== windowId) return;
      lastUrl = undefined;
      client.attach(info.tabId);
    });
  }
}
