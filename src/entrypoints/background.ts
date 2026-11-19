import { browser } from 'wxt/browser';
import { applyDisplayMode } from '@/lib/display-mode';
import { extractFromTab } from '@/lib/injection';
import { parsePortName, type BackgroundToUi, type UiToBackground } from '@/lib/messages';
import { loadSettings } from '@/lib/settings';
import { Summarizer } from '@/lib/summarizer';
import { getProvider } from '@/providers';

export default defineBackground(() => {
  const summarizer = new Summarizer({ extract: extractFromTab, loadSettings, getProvider });

  const syncDisplayMode = async () => applyDisplayMode((await loadSettings()).displayMode);
  browser.runtime.onInstalled.addListener(() => void syncDisplayMode());
  browser.runtime.onStartup.addListener(() => void syncDisplayMode());
  browser.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && 'settings' in changes) void syncDisplayMode();
  });
  void syncDisplayMode();

  // Fires only in side panel mode (no popup set). sidePanel.open must run inside the click gesture,
  // so it is called before anything is awaited.
  browser.action.onClicked.addListener((tab) => {
    if (tab.id === undefined) return;
    void browser.sidePanel.open({ tabId: tab.id });
    void summarizer.start(tab.id, { force: false });
  });

  browser.runtime.onConnect.addListener((port) => {
    const tabId = parsePortName(port.name);
    if (tabId === null) return;
    const unsubscribe = summarizer.subscribe(tabId, (state) => {
      port.postMessage({ type: 'state', state } satisfies BackgroundToUi);
    });
    port.onMessage.addListener((msg: UiToBackground) => {
      if (msg?.type === 'start') void summarizer.start(tabId, { force: msg.force === true });
    });
    // The request keeps running when the UI closes; only the subscription ends.
    port.onDisconnect.addListener(unsubscribe);
  });

  browser.tabs.onRemoved.addListener((tabId) => summarizer.forget(tabId));
});
