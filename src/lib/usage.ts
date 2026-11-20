import type { HistoryEntry } from './history';
import type { ProviderId } from './settings';
import type { SummaryUsage } from './summarizer';

type Translate = (key: string) => string;

/** "12,345 tokens in, 420 out · 8.3 s", in the interface language; '' when nothing is known. */
export function formatUsage(usage: SummaryUsage | undefined, t: Translate, locale?: string): string {
  if (!usage) return '';
  const number = new Intl.NumberFormat(locale || undefined);
  const parts: string[] = [];
  if (usage.inputTokens !== undefined && usage.outputTokens !== undefined) {
    parts.push(t('ui_usage_tokens').replace('{input}', number.format(usage.inputTokens)).replace('{output}', number.format(usage.outputTokens)));
  }
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
  inputTokens: number;
  outputTokens: number;
}

const ORDER: ProviderId[] = ['claude', 'codex', 'ollama'];

/** The tokens of the history's summaries, per provider; summaries without tokens are left out. */
export function usageByProvider(entries: HistoryEntry[]): ProviderTotal[] {
  const totals = new Map<ProviderId, ProviderTotal>();
  for (const entry of entries) {
    const usage = entry.usage;
    if (usage?.inputTokens === undefined || usage.outputTokens === undefined) continue;
    const total = totals.get(entry.provider) ?? { provider: entry.provider, count: 0, inputTokens: 0, outputTokens: 0 };
    total.count++;
    total.inputTokens += usage.inputTokens;
    total.outputTokens += usage.outputTokens;
    totals.set(entry.provider, total);
  }
  return [...totals.values()].sort((a, b) => ORDER.indexOf(a.provider) - ORDER.indexOf(b.provider));
}
