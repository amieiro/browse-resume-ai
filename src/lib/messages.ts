import type { SummaryState } from './summarizer';

/** Runtime port name used by the summary UI for a tab. */
export const portName = (tabId: number) => `summary:${tabId}`;

export function parsePortName(name: string): number | null {
  const match = /^summary:(\d+)$/.exec(name);
  return match ? Number(match[1]) : null;
}

export type UiToBackground = { type: 'start'; force: boolean };
export type BackgroundToUi = { type: 'state'; state: SummaryState };
