import { describe, expect, it, vi } from 'vitest';
import { createPortClient, type PortLike } from '@/ui/port-client';
import type { BackgroundToUi } from '@/lib/messages';

class FakePort implements PortLike {
  posted: unknown[] = [];
  disconnected = false;
  broken = false;
  private messageListeners: ((m: BackgroundToUi) => void)[] = [];
  private disconnectListeners: (() => void)[] = [];
  constructor(public name: string) {}
  onMessage = { addListener: (l: (m: BackgroundToUi) => void) => this.messageListeners.push(l) };
  onDisconnect = { addListener: (l: () => void) => this.disconnectListeners.push(l) };
  postMessage(msg: unknown) {
    if (this.broken) throw new Error('Attempting to use a disconnected port object');
    this.posted.push(msg);
  }
  disconnect() {
    this.disconnected = true;
  }
  emit(msg: BackgroundToUi) {
    this.messageListeners.forEach((l) => l(msg));
  }
  /** The service worker went away. */
  drop() {
    this.disconnectListeners.forEach((l) => l());
  }
}

function setup() {
  const ports: FakePort[] = [];
  const onState = vi.fn();
  const client = createPortClient((name) => {
    const p = new FakePort(name);
    ports.push(p);
    return p;
  }, onState);
  return { ports, onState, client };
}

describe('port client', () => {
  it('connects to the tab port and forwards states', () => {
    const { ports, onState, client } = setup();
    client.attach(7);
    expect(ports[0]!.name).toBe('summary:7');
    ports[0]!.emit({ type: 'state', state: { status: 'idle' } });
    expect(onState).toHaveBeenCalledWith({ status: 'idle' });
  });

  it('does not reconnect by itself when the port drops', () => {
    const { ports, client } = setup();
    client.attach(7);
    ports[0]!.drop();
    expect(ports.length).toBe(1);
  });

  it('reconnects on send after the port dropped', () => {
    const { ports, client } = setup();
    client.attach(7);
    ports[0]!.drop();
    client.send({ type: 'start', force: true });
    expect(ports.length).toBe(2);
    expect(ports[1]!.name).toBe('summary:7');
    expect(ports[1]!.posted).toEqual([{ type: 'start', force: true }]);
  });

  it('reconnects when posting throws on a dead port', () => {
    const { ports, client } = setup();
    client.attach(7);
    ports[0]!.broken = true;
    client.send({ type: 'start', force: false });
    expect(ports[1]!.posted).toEqual([{ type: 'start', force: false }]);
  });

  it('ensureConnected reconnects only a dead port', () => {
    const { ports, client } = setup();
    client.attach(7);
    client.ensureConnected();
    expect(ports.length).toBe(1);
    ports[0]!.drop();
    client.ensureConnected();
    expect(ports.length).toBe(2);
  });

  it('attaching to another tab closes the old port', () => {
    const { ports, client } = setup();
    client.attach(7);
    client.attach(8);
    expect(ports[0]!.disconnected).toBe(true);
    expect(ports[1]!.name).toBe('summary:8');
    expect(client.tabId()).toBe(8);
  });
});
