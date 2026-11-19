import type { ProviderId } from '@/lib/settings';

export type SummaryErrorCode =
  | 'page_unreadable'
  | 'no_content'
  | 'needs_click'
  | 'host_missing'
  | 'claude_missing'
  | 'claude_auth'
  | 'codex_missing'
  | 'codex_signed_out'
  | 'codex_not_eligible'
  | 'usage_limit'
  | 'provider_failed';

export class SummaryError extends Error {
  constructor(
    public readonly code: SummaryErrorCode,
    message?: string,
  ) {
    super(message ?? code);
    this.name = 'SummaryError';
  }
}

export type Availability = { ok: true } | { ok: false; code: SummaryErrorCode };

export interface Provider {
  id: ProviderId;
  label: string;
  checkAvailability(): Promise<Availability>;
  /** Yields text chunks. Ends without throwing when the signal is aborted. */
  summarize(prompt: string, model: string, signal: AbortSignal): AsyncIterable<string>;
}
