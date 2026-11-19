import type { ProviderId } from '@/lib/settings';
import { claudeProvider } from './claude';
import type { Provider } from './types';

export const PROVIDERS: Provider[] = [claudeProvider];

export function getProvider(id: ProviderId): Provider {
  const provider = PROVIDERS.find((p) => p.id === id);
  if (!provider) throw new Error(`Unknown provider: ${id}`);
  return provider;
}
