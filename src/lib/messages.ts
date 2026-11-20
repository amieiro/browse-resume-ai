import type { SummaryState } from './summarizer';

/** Runtime port name used by the summary UI for a tab. */
export const portName = (tabId: number) => `summary:${tabId}`;

export function parsePortName(name: string): number | null {
  const match = /^summary:(\d+)$/.exec(name);
  return match ? Number(match[1]) : null;
}

export type UiToBackground = { type: 'start'; force: boolean } | { type: 'ask'; question: string };
export type BackgroundToUi = { type: 'state'; state: SummaryState };

/** Broadcast with runtime.sendMessage when a summary starts outside a UI port (an icon click), so a
 * side panel whose port died with the suspended service worker reconnects. */
export type SummaryStartedBroadcast = { type: 'summary-started'; tabId: number };
