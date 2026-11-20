import { browser } from 'wxt/browser';
import type { TokenUsage } from '@/providers/types';

/** US dollars per million tokens. */
export interface ModelPrice {
  input: number;
  output: number;
  /** Input tokens read from the prompt cache; the input price when unknown. */
  cachedInput?: number;
}

/**
 * OpenAI API prices, as the local host read them from LiteLLM's public list, for the approximate
 * cost of a Codex summary (Codex does not report one). Read again once a day.
 */
export interface PriceTable {
  checkedAt: number;
  openai: Record<string, ModelPrice>;
}

export interface PriceDeps {
  fetchPrices(): Promise<Record<string, ModelPrice> | null>;
  now(): number;
}

export const PRICES_KEY = 'apiPrices';
const DAY_MS = 24 * 60 * 60 * 1000;
/** After a failed download, wait this long before trying again. */
const RETRY_MS = 60 * 60 * 1000;

export async function getPrices(): Promise<PriceTable | null> {
  const result = await browser.storage.local.get(PRICES_KEY);
  return (result[PRICES_KEY] as PriceTable | undefined) ?? null;
}

let lastFailure: number | null = null;
let pending: Promise<PriceTable | null> | null = null;

/** For tests. */
export function resetPriceState(): void {
  lastFailure = null;
  pending = null;
}

/** Downloads the prices when they are a day old (or missing); keeps the old ones if it fails. */
export function ensureFreshPrices(deps: PriceDeps, force = false): Promise<PriceTable | null> {
  pending ??= (async () => {
    const current = await getPrices();
    const now = deps.now();
    const fresh = current && now - current.checkedAt < DAY_MS && now >= current.checkedAt;
    const waiting = lastFailure !== null && now >= lastFailure && now - lastFailure < RETRY_MS;
    if (!force && (fresh || waiting)) return current;
    const openai = await deps.fetchPrices();
    if (!openai) {
      lastFailure = now;
      return current;
    }
    const table: PriceTable = { checkedAt: now, openai };
    await browser.storage.local.set({ [PRICES_KEY]: table });
    return table;
  })().finally(() => {
    pending = null;
  });
  return pending;
}

/** What the tokens would cost through the OpenAI API, or null when the model has no known price. */
export function openAiCost(usage: TokenUsage & { cachedInputTokens?: number }, model: string, table: PriceTable | null): number | null {
  const price = table?.openai[model];
  if (!price) return null;
  const cached = Math.min(usage.cachedInputTokens ?? 0, usage.inputTokens);
  const dollars = (usage.inputTokens - cached) * price.input + cached * (price.cachedInput ?? price.input) + usage.outputTokens * price.output;
  return dollars / 1e6;
}
