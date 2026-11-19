import { browser } from 'wxt/browser';
import { portName, type BackgroundToUi, type UiToBackground } from '@/lib/messages';
import { loadSettings, saveSettings } from '@/lib/settings';
import { mountSummaryView } from './summary-view';

interface Options {
  /** Popup: ask for a summary as soon as it opens. The side panel is started by the icon click. */
  startOnOpen: boolean;
  /** Side panel: follow the active tab of its window. */
  followActiveTab: boolean;
}

type Port = ReturnType<typeof browser.runtime.connect>;

async function activeTabId(): Promise<number | undefined> {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  return tab?.id;
}

export async function startSummaryApp(root: HTMLElement, options: Options): Promise<void> {
  let port: Port | null = null;
  const send = (msg: UiToBackground) => port?.postMessage(msg);

  const view = mountSummaryView(root, await loadSettings(), {
    onRegenerate: () => send({ type: 'start', force: true }),
    onSettingsChange: (patch) => void saveSettings(patch),
    onOpenOptions: () => void browser.runtime.openOptionsPage(),
  });

  browser.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && 'settings' in changes) void loadSettings().then(view.setSettings);
  });

  const attach = (tabId: number) => {
    port?.disconnect();
    port = browser.runtime.connect({ name: portName(tabId) });
    port.onMessage.addListener((msg: BackgroundToUi) => {
      if (msg.type === 'state') view.setState(msg.state);
    });
  };

  const tabId = await activeTabId();
  if (tabId === undefined) return;
  attach(tabId);
  if (options.startOnOpen) send({ type: 'start', force: false });

  if (options.followActiveTab) {
    const { id: windowId } = await browser.windows.getCurrent();
    browser.tabs.onActivated.addListener((info) => {
      if (info.windowId === windowId) attach(info.tabId);
    });
  }
}
