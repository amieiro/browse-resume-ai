import type { HistoryEntry } from './history';
import type { ProviderId } from './settings';
import type { SummaryUsage } from './summarizer';

type Translate = (key: string) => string;

/** Dollars with two significant digits below one ($0.012, $0.00013), cents above ($1.25). */
export function formatCost(dollars: number, locale?: string): string {
  const options: Intl.NumberFormatOptions =
    dollars > 0 && dollars < 1 ? { maximumSignificantDigits: 2 } : { minimumFractionDigits: 2, maximumFractionDigits: 2 };
  return new Intl.NumberFormat(locale || undefined, { style: 'currency', currency: 'USD', ...options }).format(dollars);
}

/**
 * "12,345 tokens in, 420 out · ≈ $0.012 estimated at API prices · 8.3 s", in the interface
 * language; '' when nothing is known. The cost is an estimate, never what the user pays.
 */
export function formatUsage(usage: SummaryUsage | undefined, t: Translate, locale?: string): string {
  if (!usage) return '';
  const number = new Intl.NumberFormat(locale || undefined);
  const parts: string[] = [];
  if (usage.inputTokens !== undefined && usage.outputTokens !== undefined) {
    parts.push(t('ui_usage_tokens').replace('{input}', number.format(usage.inputTokens)).replace('{output}', number.format(usage.outputTokens)));
  }
  if (usage.local) parts.push(t('ui_usage_local'));
  else if (usage.costUsd !== undefined && Number.isFinite(usage.costUsd)) parts.push(t('ui_usage_cost').replace('{cost}', formatCost(usage.costUsd, locale)));
  if (Number.isFinite(usage.ms) && usage.ms > 0) {
    const seconds = new Intl.NumberFormat(locale || undefined, { maximumFractionDigits: 1, minimumFractionDigits: 1 }).format(usage.ms / 1000);
    parts.push(t('ui_usage_time').replace('{seconds}', seconds));
  }
  return parts.join(' · ');
}

export interface ProviderTotal {
  provider: ProviderId;
  /** Summaries with a known usage. */
  count: number;
  /** Answers to questions with a known usage; their tokens and cost are in the totals too. */
  questions: number;
  inputTokens: number;
  outputTokens: number;
  /** The summed estimate, when at least one summary had one. */
  costUsd?: number;
  local?: true;
}

const ORDER: ProviderId[] = ['claude', 'codex', 'ollama'];

/**
 * The tokens of the history's summaries and of the answers to questions about them, per provider;
 * those without tokens are left out.
 */
export function usageByProvider(entries: HistoryEntry[]): ProviderTotal[] {
  const totals = new Map<ProviderId, ProviderTotal>();
  const add = (provider: ProviderId, usage: SummaryUsage | undefined, kind: 'count' | 'questions') => {
    if (usage?.inputTokens === undefined || usage.outputTokens === undefined) return;
    const total = totals.get(provider) ?? { provider, count: 0, questions: 0, inputTokens: 0, outputTokens: 0 };
    total[kind]++;
    total.inputTokens += usage.inputTokens;
    total.outputTokens += usage.outputTokens;
    if (usage.costUsd !== undefined && Number.isFinite(usage.costUsd)) total.costUsd = (total.costUsd ?? 0) + usage.costUsd;
    if (usage.local) total.local = true;
    totals.set(provider, total);
  };
  for (const entry of entries) {
    add(entry.provider, entry.usage, 'count');
    for (const item of entry.qa ?? []) if (item.status === 'done') add(entry.provider, item.usage, 'questions');
  }
  return [...totals.values()].sort((a, b) => ORDER.indexOf(a.provider) - ORDER.indexOf(b.provider));
}
