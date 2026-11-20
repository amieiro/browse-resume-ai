import { cacheKey, clearCached, getCached, getLastCached, setCached } from './cache';
import { buildPrompt, MAX_ARTICLE_CHARS, type Article } from './prompt';
import type { ProviderId, Settings } from './settings';
import { SummaryError, type Provider, type SummaryErrorCode } from '@/providers/types';

/** What a summary is of: the page's article, or text the reader selected (marked with source). */
type Source = { source?: 'selection' };

export type SummaryState =
  | { status: 'idle' }
  | ({ status: 'running' | 'done'; title: string; text: string; truncated: boolean } & Source)
  | ({ status: 'error'; code: SummaryErrorCode; title: string; text: string; truncated: boolean; detail?: string } & Source);

/** A "Summarize the selection" menu click. */
export interface SelectionRequest {
  url: string;
  title: string;
  /** The selection as Chrome gives it with the click (without line breaks); used if the page cannot be read. */
  selectionText: string;
  /** The frame the selection is in. */
  frameId?: number;
}

export interface SummarizerDeps {
  /** Throws SummaryError('page_unreadable' | 'needs_click'); returns null when there is no article text. */
  extract(tabId: number): Promise<Article | null>;
  /** The selected text, read from the page with its line breaks; null when the page cannot be read. */
  extractSelection(tabId: number, frameId?: number): Promise<string | null>;
  loadSettings(): Promise<Settings>;
  getProvider(id: ProviderId): Provider;
}

type Listener = (state: SummaryState) => void;
type Kind = 'page' | 'selection';

const IDLE: SummaryState = { status: 'idle' };

/** A short, stable fingerprint of the selected text, so each selection has its own cache key. */
function fingerprint(text: string): string {
  let hash = 5381;
  for (let i = 0; i < text.length; i++) hash = ((hash << 5) + hash + text.charCodeAt(i)) | 0;
  return `${text.length}:${(hash >>> 0).toString(36)}`;
}

/** Owns one summary request per tab. UIs come and go; requests keep running. */
export class Summarizer {
  private states = new Map<number, SummaryState>();
  private running = new Map<number, { controller: AbortController; key: string; kind: Kind }>();
  private generations = new Map<number, number>();
  private listeners = new Map<number, Set<Listener>>();
  /** The last selection summarized in each tab, so Summarize again repeats it. */
  private selections = new Map<number, SelectionRequest>();

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
    this.selections.delete(tabId);
    void clearCached(tabId);
  }

  /**
   * Starts a summary of the tab's page. Without force, a request already running for the same page
   * and settings is kept (the caller just attaches to it), and so is a running selection summary
   * (the popup opening after a menu click); a finished one is served from the cache. With force on a
   * tab that shows a selection summary (Summarize again), the selection is summarized again.
   */
  async start(tabId: number, opts: { force: boolean }): Promise<void> {
    const current = this.states.get(tabId);
    const selection = this.selections.get(tabId);
    if (opts.force && selection && current && current.status !== 'idle' && current.source === 'selection') {
      return this.startSelection(tabId, selection);
    }
    if (!opts.force && this.running.get(tabId)?.kind === 'selection') return;

    const generation = this.bumpGeneration(tabId);
    const superseded = () => this.generations.get(tabId) !== generation;
    if (opts.force) this.abortRunning(tabId);
    // Reading the page can take a few seconds: show the progress indicator from the start, unless
    // a request is already running (a non-forced start may attach to it and keep its text).
    if (!this.running.has(tabId)) this.setState(tabId, { status: 'running', title: '', text: '', truncated: false });

    let settings: Settings;
    let article: Article | null;
    try {
      settings = await this.deps.loadSettings();
      article = await this.deps.extract(tabId);
    } catch (error) {
      if (superseded()) return;
      this.abortRunning(tabId);
      this.setState(tabId, errorState(codeOf(error), { title: '', text: '', truncated: false }, 'page', detailOf(error)));
      return;
    }
    if (superseded()) return;
    if (!article) {
      this.abortRunning(tabId);
      this.setState(tabId, errorState('no_content', { title: '', text: '', truncated: false }, 'page'));
      return;
    }

    const key = cacheKey(article.url, { ...settings, model: settings.models[settings.provider] });
    if (!opts.force && this.running.get(tabId)?.key === key) return;
    await this.run(tabId, article, settings, key, 'page', opts.force);
  }

  /** Summarizes the text selected in the tab (a context menu click). Always a new request. */
  async startSelection(tabId: number, request: SelectionRequest): Promise<void> {
    const generation = this.bumpGeneration(tabId);
    const superseded = () => this.generations.get(tabId) !== generation;
    this.abortRunning(tabId);
    this.selections.set(tabId, request);
    // Claim the tab at once, before any await: the popup opened by the same click sends a
    // non-forced start, which must attach to this request instead of summarizing the page.
    const placeholder = new AbortController();
    this.running.set(tabId, { controller: placeholder, key: '', kind: 'selection' });
    const empty = { title: request.title, text: '', truncated: false };
    this.setState(tabId, { status: 'running', ...empty, source: 'selection' });

    let settings: Settings;
    let selected: string;
    try {
      settings = await this.deps.loadSettings();
      selected = ((await this.deps.extractSelection(tabId, request.frameId)) || request.selectionText).trim();
    } catch (error) {
      if (superseded()) return;
      this.abortRunning(tabId);
      this.setState(tabId, errorState(codeOf(error), empty, 'selection', detailOf(error)));
      return;
    }
    if (superseded()) return;
    if (this.running.get(tabId)?.controller === placeholder) this.running.delete(tabId);
    if (!selected) {
      this.setState(tabId, errorState('no_content', empty, 'selection'));
      return;
    }

    const truncated = selected.length > MAX_ARTICLE_CHARS;
    const article: Article = {
      title: request.title,
      url: request.url,
      text: truncated ? selected.slice(0, MAX_ARTICLE_CHARS) : selected,
      truncated,
    };
    const model = settings.models[settings.provider];
    const key = `${cacheKey(request.url, { ...settings, model })}#selection:${fingerprint(article.text)}`;
    await this.run(tabId, article, settings, key, 'selection', true);
  }

  private async run(tabId: number, article: Article, settings: Settings, key: string, kind: Kind, force: boolean): Promise<void> {
    const { title, truncated } = article;
    const tag: Source = kind === 'selection' ? { source: 'selection' } : {};
    let text = '';

    this.abortRunning(tabId);
    const controller = new AbortController();
    this.running.set(tabId, { controller, key, kind });
    const { signal } = controller;
    const isCurrent = () => !signal.aborted && this.running.get(tabId)?.controller === controller;
    const set = (state: SummaryState) => {
      if (isCurrent()) this.setState(tabId, state);
    };

    try {
      if (!force) {
        const cached = await getCached(tabId, key);
        if (cached) {
          set({ status: 'done', title: cached.title, text: cached.text, truncated: cached.truncated, ...tag });
          return;
        }
      }

      const provider = this.deps.getProvider(settings.provider);
      const availability = await provider.checkAvailability();
      if (!availability.ok) return set(errorState(availability.code, { title, text, truncated }, kind));

      set({ status: 'running', title, text, truncated, ...tag });
      const prompt = buildPrompt(article, settings.length, settings.language, kind === 'selection' ? 'selection' : 'article');
      for await (const chunk of provider.summarize(prompt, settings.models[settings.provider], signal)) {
        if (!isCurrent()) return;
        text += chunk;
        set({ status: 'running', title, text, truncated, ...tag });
      }
      if (!isCurrent()) return;
      await setCached(tabId, { key, title, text, truncated, ...tag });
      set({ status: 'done', title, text, truncated, ...tag });
    } catch (error) {
      set(errorState(codeOf(error), { title, text, truncated }, kind, detailOf(error)));
    } finally {
      if (this.running.get(tabId)?.controller === controller) this.running.delete(tabId);
    }
  }

  /** After a service worker restart nothing is in memory; show the tab's last summary again. */
  private async restore(tabId: number): Promise<void> {
    const entry = await getLastCached(tabId);
    if (entry && !this.states.has(tabId)) {
      const tag: Source = entry.source === 'selection' ? { source: 'selection' } : {};
      this.setState(tabId, { status: 'done', title: entry.title, text: entry.text, truncated: entry.truncated, ...tag });
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

function errorState(
  code: SummaryErrorCode,
  content: { title: string; text: string; truncated: boolean },
  kind: Kind,
  detail?: string,
): SummaryState {
  return {
    status: 'error',
    code,
    ...content,
    ...(detail ? { detail } : {}),
    ...(kind === 'selection' ? { source: 'selection' as const } : {}),
  };
}

function detailOf(error: unknown): string | undefined {
  if (error instanceof SummaryError) return error.message !== error.code ? error.message : undefined;
  return error instanceof Error ? error.message : undefined;
}

function codeOf(error: unknown): SummaryErrorCode {
  return error instanceof SummaryError ? error.code : 'provider_failed';
}
