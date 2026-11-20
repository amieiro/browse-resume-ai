import type { ProviderId } from '@/lib/settings';

export type SummaryErrorCode =
  | 'page_unreadable'
  | 'no_content'
  | 'needs_click'
  | 'file_access'
  | 'pdf_unreadable'
  | 'pdf_no_text'
  | 'no_transcript'
  | 'host_missing'
  | 'claude_missing'
  | 'claude_auth'
  | 'codex_missing'
  | 'codex_signed_out'
  | 'codex_not_eligible'
  | 'ollama_missing'
  | 'ollama_model_missing'
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

/** The tokens a request used, as the provider reports them (the input includes cached tokens). */
export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  /** Input tokens read from the prompt cache (Codex), part of inputTokens. */
  cachedInputTokens?: number;
  /** What the request would cost at API prices, when the provider works it out (Claude Code). */
  costUsd?: number;
}

export type Availability = { ok: true } | { ok: false; code: SummaryErrorCode };

export interface Provider {
  id: ProviderId;
  label: string;
  checkAvailability(): Promise<Availability>;
  /**
   * Yields text chunks. Ends without throwing when the signal is aborted. onUsage gets the tokens
   * used, before the end, when the provider reports them.
   */
  summarize(prompt: string, model: string, signal: AbortSignal, onUsage?: (usage: TokenUsage) => void): AsyncIterable<string>;
}
