import { browser } from 'wxt/browser';
import type { SummaryStartedBroadcast } from '@/lib/messages';
import { loadSettings, saveSettings } from '@/lib/settings';
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
  const client = createPortClient(
    (name) => browser.runtime.connect({ name }),
    (state) => view.setState(state),
  );

  const view = mountSummaryView(root, await bootPage(), {
    onRegenerate: () => client.send({ type: 'start', force: true }),
    onSettingsChange: (patch) => void saveSettings(patch),
    onOpenOptions: () => void browser.runtime.openOptionsPage(),
  });

  browser.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && 'settings' in changes) void loadSettings().then(view.setSettings);
  });

  // An icon click while the service worker slept: our port is dead, reopen it to see the new summary.
  browser.runtime.onMessage.addListener((msg: SummaryStartedBroadcast) => {
    if (msg?.type === 'summary-started' && msg.tabId === client.tabId()) client.ensureConnected();
  });

  const tabId = await activeTabId();
  if (tabId === undefined) return;
  client.attach(tabId);
  if (options.startOnOpen) client.send({ type: 'start', force: false });

  if (options.followActiveTab) {
    const { id: windowId } = await browser.windows.getCurrent();
    browser.tabs.onActivated.addListener((info) => {
      if (info.windowId === windowId) client.attach(info.tabId);
    });
  }
}
