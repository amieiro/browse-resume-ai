// API prices of OpenAI models, for the cost a Codex summary would have through the API. Codex does
// not report a cost, so the host reads LiteLLM's public price list (the extension asks once a day).
// Only prices come back: nothing about the user is sent, it is a plain GET of a public file.

export const PRICES_URL = 'https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json';
const TIMEOUT_MS = 30_000;
/** Plain model names only, as Codex uses them ("gpt-6.2-sol"), not "azure/..." variants. */
const NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

const perMillion = (value) => (typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.round(value * 1e6 * 1e6) / 1e6 : null);

/** { model: { input, output, cachedInput? } } in US dollars per million tokens, from LiteLLM's list. */
export function openAiPrices(list) {
  const prices = {};
  if (!list || typeof list !== 'object') return prices;
  for (const [name, entry] of Object.entries(list)) {
    if (!NAME.test(name) || !entry || typeof entry !== 'object' || entry.litellm_provider !== 'openai') continue;
    const input = perMillion(entry.input_cost_per_token);
    const output = perMillion(entry.output_cost_per_token);
    if (input === null || output === null) continue;
    const cachedInput = perMillion(entry.cache_read_input_token_cost);
    prices[name] = cachedInput === null ? { input, output } : { input, output, cachedInput };
  }
  return prices;
}

/** Downloads the list; resolves to the prices, or null when it cannot be read. */
export async function fetchOpenAiPrices(url = process.env.BROWSE_RESUME_AI_PRICES_URL || PRICES_URL) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) return null;
    const prices = openAiPrices(await res.json());
    return Object.keys(prices).length ? prices : null;
  } catch {
    return null;
  }
}
