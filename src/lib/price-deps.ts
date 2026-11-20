import { fetchPrices } from '@/providers/native';
import type { PriceDeps } from './prices';

/** The price list's dependencies in the extension: the local host and the clock. */
export function priceDeps(): PriceDeps {
  return { fetchPrices, now: () => Date.now() };
}
