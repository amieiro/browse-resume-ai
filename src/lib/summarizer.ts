import { cacheKey, clearCached, getCached, getLastCached, setCached } from './cache';
import { buildPrompt, type Article } from './prompt';
import type { ProviderId, Settings } from './settings';
import { SummaryError, type Provider, type SummaryErrorCode } from '@/providers/types';

export type SummaryState =
  | { status: 'idle' }
  | { status: 'running' | 'done'; title: string; text: string; truncated: boolean }
  | { status: 'error'; code: SummaryErrorCode; title: string; text: string; truncated: boolean; detail?: string };

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
  private running = new Map<number, { controller: AbortController; key: string }>();
  private generations = new Map<number, number>();
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
    if (!this.states.has(tabId)) void this.restore(tabId);
    return () => {
      set.delete(listener);
    };
  }

  forget(tabId: number): void {
    this.bumpGeneration(tabId);
    this.abortRunning(tabId);
    this.states.delete(tabId);
    this.listeners.delete(tabId);
    void clearCached(tabId);
  }

  /**
   * Starts a summary of the tab's page. Without force, a request already running for the same page
   * and settings is kept (the caller just attaches to it) and a finished one is served from the cache.
   */
  async start(tabId: number, opts: { force: boolean }): Promise<void> {
    const generation = this.bumpGeneration(tabId);
    const superseded = () => this.generations.get(tabId) !== generation;
    if (opts.force) this.abortRunning(tabId);
    // Reading the page can take a few seconds: show the progress indicator from the start, unless
    // a request is already running (a non-forced start may attach to it and keep its text).
    if (!this.running.has(tabId)) this.setState(tabId, { status: 'running', title: '', text: '', truncated: false });

    let title = '';
    let text = '';
    let truncated = false;
    const errorState = (code: SummaryErrorCode, detail?: string): SummaryState => ({
      status: 'error', code, title, text, truncated, ...(detail ? { detail } : {}),
    });
    const detailOf = (error: unknown) =>
      error instanceof SummaryError ? (error.message !== error.code ? error.message : undefined) : error instanceof Error ? error.message : undefined;
    const codeOf = (error: unknown): SummaryErrorCode => (error instanceof SummaryError ? error.code : 'provider_failed');

    let settings: Settings;
    let article: Article | null;
    try {
      settings = await this.deps.loadSettings();
      article = await this.deps.extract(tabId);
    } catch (error) {
      if (superseded()) return;
      this.abortRunning(tabId);
      this.setState(tabId, errorState(codeOf(error), detailOf(error)));
      return;
    }
    if (superseded()) return;
    if (!article) {
      this.abortRunning(tabId);
      this.setState(tabId, errorState('no_content'));
      return;
    }
    ({ title, truncated } = article);

    const model = settings.models[settings.provider];
    const key = cacheKey(article.url, { ...settings, model });
    if (!opts.force && this.running.get(tabId)?.key === key) return;

    this.abortRunning(tabId);
    const controller = new AbortController();
    this.running.set(tabId, { controller, key });
    const { signal } = controller;
    const isCurrent = () => !signal.aborted && this.running.get(tabId)?.controller === controller;
    const set = (state: SummaryState) => {
      if (isCurrent()) this.setState(tabId, state);
    };

    try {
      if (!opts.force) {
        const cached = await getCached(tabId, key);
        if (cached) {
          set({ status: 'done', title: cached.title, text: cached.text, truncated: cached.truncated });
          return;
        }
      }

      const provider = this.deps.getProvider(settings.provider);
      const availability = await provider.checkAvailability();
      if (!availability.ok) return set(errorState(availability.code));

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
      set(errorState(codeOf(error), detailOf(error)));
    } finally {
      if (this.running.get(tabId)?.controller === controller) this.running.delete(tabId);
    }
  }

  /** After a service worker restart nothing is in memory; show the tab's last summary again. */
  private async restore(tabId: number): Promise<void> {
    const entry = await getLastCached(tabId);
    if (entry && !this.states.has(tabId)) {
      this.setState(tabId, { status: 'done', title: entry.title, text: entry.text, truncated: entry.truncated });
    }
  }

  private bumpGeneration(tabId: number): number {
    const next = (this.generations.get(tabId) ?? 0) + 1;
    this.generations.set(tabId, next);
    return next;
  }

  private abortRunning(tabId: number): void {
    this.running.get(tabId)?.controller.abort();
    this.running.delete(tabId);
  }

  private setState(tabId: number, state: SummaryState): void {
    this.states.set(tabId, state);
    this.listeners.get(tabId)?.forEach((listener) => listener(state));
  }
}
