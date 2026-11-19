import { cacheKey, clearCached, getCached, setCached } from './cache';
import { buildPrompt, type Article } from './prompt';
import type { ProviderId, Settings } from './settings';
import { SummaryError, type Provider, type SummaryErrorCode } from '@/providers/types';

export type SummaryState =
  | { status: 'idle' }
  | { status: 'running' | 'done'; title: string; text: string; truncated: boolean }
  | { status: 'error'; code: SummaryErrorCode; title: string; text: string; truncated: boolean };

export interface SummarizerDeps {
  /** Throws SummaryError('page_unreadable' | 'needs_click'); returns null when there is no article text. */
  extract(tabId: number): Promise<Article | null>;
  loadSettings(): Promise<Settings>;
  getProvider(id: ProviderId): Provider;
}

type Listener = (state: SummaryState) => void;

const IDLE: SummaryState = { status: 'idle' };

/** Owns one summary request per tab. UIs come and go; requests keep running. */
export class Summarizer {
  private states = new Map<number, SummaryState>();
  private controllers = new Map<number, AbortController>();
  private listeners = new Map<number, Set<Listener>>();

  constructor(private readonly deps: SummarizerDeps) {}

  getState(tabId: number): SummaryState {
    return this.states.get(tabId) ?? IDLE;
  }

  subscribe(tabId: number, listener: Listener): () => void {
    let set = this.listeners.get(tabId);
    if (!set) this.listeners.set(tabId, (set = new Set()));
    set.add(listener);
    listener(this.getState(tabId));
    return () => {
      set.delete(listener);
    };
  }

  forget(tabId: number): void {
    this.controllers.get(tabId)?.abort();
    this.controllers.delete(tabId);
    this.states.delete(tabId);
    this.listeners.delete(tabId);
    void clearCached(tabId);
  }

  async start(tabId: number, opts: { force: boolean }): Promise<void> {
    this.controllers.get(tabId)?.abort();
    const controller = new AbortController();
    this.controllers.set(tabId, controller);
    const { signal } = controller;
    const isCurrent = () => !signal.aborted && this.controllers.get(tabId) === controller;
    const set = (state: SummaryState) => {
      if (isCurrent()) this.setState(tabId, state);
    };

    let title = '';
    let text = '';
    let truncated = false;
    const fail = (code: SummaryErrorCode) => set({ status: 'error', code, title, text, truncated });

    try {
      const settings = await this.deps.loadSettings();
      const article = await this.deps.extract(tabId);
      if (!isCurrent()) return;
      if (!article) return fail('no_content');
      ({ title, truncated } = article);

      const model = settings.models[settings.provider];
      const key = cacheKey(article.url, { ...settings, model });
      if (!opts.force) {
        const cached = await getCached(tabId, key);
        if (cached) {
          set({ status: 'done', title: cached.title, text: cached.text, truncated: cached.truncated });
          return;
        }
      }

      const provider = this.deps.getProvider(settings.provider);
      const availability = await provider.checkAvailability();
      if (!availability.ok) return fail(availability.code);

      set({ status: 'running', title, text, truncated });
      const prompt = buildPrompt(article, settings.length, settings.language);
      for await (const chunk of provider.summarize(prompt, model, signal)) {
        if (!isCurrent()) return;
        text += chunk;
        set({ status: 'running', title, text, truncated });
      }
      if (!isCurrent()) return;
      await setCached(tabId, { key, title, text, truncated });
      set({ status: 'done', title, text, truncated });
    } catch (error) {
      if (!isCurrent()) return;
      fail(error instanceof SummaryError ? error.code : 'provider_failed');
    } finally {
      if (this.controllers.get(tabId) === controller) this.controllers.delete(tabId);
    }
  }

  private setState(tabId: number, state: SummaryState): void {
    this.states.set(tabId, state);
    this.listeners.get(tabId)?.forEach((listener) => listener(state));
  }
}
