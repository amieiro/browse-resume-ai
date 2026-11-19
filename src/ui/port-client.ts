import { portName, type BackgroundToUi, type UiToBackground } from '@/lib/messages';
import type { SummaryState } from '@/lib/summarizer';

export interface PortLike {
  postMessage(msg: unknown): void;
  disconnect(): void;
  onMessage: { addListener(listener: (msg: BackgroundToUi) => void): void };
  onDisconnect: { addListener(listener: () => void): void };
}

/**
 * Keeps the UI's port to the background for one tab. An open port does not keep the MV3 service
 * worker alive, so the port dies when the worker is suspended. It is reopened lazily (on send, or
 * when the background announces work for this tab) rather than at once, which would wake the
 * worker in a loop.
 */
export function createPortClient(connect: (name: string) => PortLike, onState: (state: SummaryState) => void) {
  let port: PortLike | null = null;
  let tabId: number | null = null;

  const open = (): PortLike | null => {
    if (tabId === null) return null;
    const p = connect(portName(tabId));
    p.onMessage.addListener((msg) => {
      if (msg?.type === 'state' && port === p) onState(msg.state);
    });
    p.onDisconnect.addListener(() => {
      if (port === p) port = null;
    });
    port = p;
    return p;
  };

  return {
    attach(id: number) {
      port?.disconnect();
      port = null;
      tabId = id;
      open();
    },
    ensureConnected() {
      if (!port) open();
    },
    send(msg: UiToBackground) {
      const p = port ?? open();
      if (!p) return;
      try {
        p.postMessage(msg);
      } catch {
        port = null;
        open()?.postMessage(msg);
      }
    },
    tabId: () => tabId,
  };
}
