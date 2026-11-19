import { vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';

type Listener<T> = (arg: T) => void;

/** A scripted native messaging port. `respond` is called for every message the extension posts. */
export class FakeNativePort {
  posted: any[] = [];
  disconnected = false;
  private messageListeners: Listener<any>[] = [];
  private disconnectListeners: Listener<unknown>[] = [];

  constructor(private respond: (msg: any, port: FakeNativePort) => void) {}

  onMessage = { addListener: (l: Listener<any>) => this.messageListeners.push(l) };
  onDisconnect = { addListener: (l: Listener<unknown>) => this.disconnectListeners.push(l) };

  postMessage(msg: any) {
    this.posted.push(msg);
    queueMicrotask(() => this.respond(msg, this));
  }

  disconnect() {
    this.disconnected = true;
  }

  /** Host side: send a message to the extension. */
  emit(msg: any) {
    if (!this.disconnected) this.messageListeners.forEach((l) => l(msg));
  }

  /** Host side: the host went away. */
  drop(lastError?: string) {
    if (this.disconnected) return;
    (fakeBrowser.runtime as any).lastError = lastError ? { message: lastError } : undefined;
    this.disconnectListeners.forEach((l) => l(this));
    (fakeBrowser.runtime as any).lastError = undefined;
  }
}

export function mockConnectNative(respond: (msg: any, port: FakeNativePort) => void) {
  const ports: FakeNativePort[] = [];
  (fakeBrowser.runtime as any).connectNative = vi.fn((_name: string) => {
    const port = new FakeNativePort(respond);
    ports.push(port);
    return port;
  });
  return ports;
}
