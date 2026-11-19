import type { ProviderId } from '@/lib/settings';
import { claudeProvider } from './claude';
import { codexProvider } from './codex';
import type { Provider } from './types';

export const PROVIDERS: Provider[] = [claudeProvider, codexProvider];

export function getProvider(id: ProviderId): Provider {
  const provider = PROVIDERS.find((p) => p.id === id);
  if (!provider) throw new Error(`Unknown provider: ${id}`);
  return provider;
}
