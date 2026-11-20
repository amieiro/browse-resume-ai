import { cacheKey, clearCached, getCached, getLastCached, setCached } from './cache';
import { buildPrompt, MAX_ARTICLE_CHARS, type Article } from './prompt';
import type { HistoryEntry } from './history';
import { buildQuestionPrompt } from './question-prompt';
import { openAiCost, type PriceTable } from './prices';
import { STANDARD_STYLE, styleInstruction } from './styles';
import type { ProviderId, Settings } from './settings';
import { SummaryError, type Provider, type SummaryErrorCode, type TokenUsage } from '@/providers/types';

/** What a summary is of: the page's article, or text the reader selected (marked with source). */
type Source = { source?: 'selection'; /** The page the summary is of. */ url?: string };

/** A question about the summarized page and its answer, shown under the summary. */
export interface QaItem {
  question: string;
  answer: string;
  status: 'running' | 'done' | 'error';
  code?: SummaryErrorCode;
  /** What the answer took, as for a summary (from 0.16.0 on). */
  usage?: SummaryUsage;
}

/** Longest question accepted; longer ones are cut. */
export const MAX_QUESTION_CHARS = 1000;

/**
 * What a summary took: how long the model wrote, the tokens when the provider reports them, and the
 * approximate cost at API prices (costUsd) when it is known. local: run on this computer (Ollama).
 */
export interface SummaryUsage extends Partial<TokenUsage> {
  ms: number;
  local?: true;
}

export type SummaryState =
  | { status: 'idle' }
  | ({
      status: 'running' | 'done';
      title: string;
      text: string;
      truncated: boolean;
      qa?: QaItem[];
      usage?: SummaryUsage;
      /** Shown again from the cache: no new request was made. */
      cached?: true;
    } & Source)
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
  /** The clock, for tests. */
  now?(): number;
  /** The OpenAI API prices last downloaded, for the approximate cost of a Codex summary. */
  prices?(): Promise<PriceTable | null>;
  getProvider(id: ProviderId): Provider;
  /** Where finished summaries are kept, when the history is on. */
  history?: {
    add(entry: Omit<HistoryEntry, 'id' | 'createdAt'>): Promise<string>;
    updateQuestions(id: string, qa: QaItem[]): Promise<void>;
  };
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
  /** The text each tab's summary was made from, for questions about it. */
  private articles = new Map<number, { article: Article; kind: Kind }>();
  /** The history entry of each tab's summary, for its questions. */
  private historyIds = new Map<number, string>();
  /** The question being answered in each tab. */
  private asking = new Map<number, AbortController>();

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
    this.articles.delete(tabId);
    this.historyIds.delete(tabId);
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
    const tag: Source = { ...(kind === 'selection' ? { source: 'selection' as const } : {}), ...(article.url ? { url: article.url } : {}) };
    let text = '';

    this.articles.set(tabId, { article, kind });
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
          const qa = cached.qa?.length ? { qa: cached.qa } : {};
          if (cached.historyId) this.historyIds.set(tabId, cached.historyId);
          const usage = cached.usage ? { usage: cached.usage } : {};
          set({ status: 'done', title: cached.title, text: cached.text, truncated: cached.truncated, ...tag, ...qa, ...usage, cached: true });
          return;
        }
      }

      const provider = this.deps.getProvider(settings.provider);
      const availability = await provider.checkAvailability();
      if (!availability.ok) return set(errorState(availability.code, { title, text, truncated, url: tag.url }, kind));

      set({ status: 'running', title, text, truncated, ...tag });
      const prompt = buildPrompt(article, settings.length, settings.language, kind === 'selection' ? 'selection' : 'article', styleInstruction(settings));
      const now = this.deps.now ?? Date.now;
      const startedAt = now();
      let tokens: TokenUsage | null = null;
      const onUsage = (reported: TokenUsage) => (tokens = reported);
      for await (const chunk of provider.summarize(prompt, settings.models[settings.provider], signal, onUsage)) {
        if (!isCurrent()) return;
        text += chunk;
        set({ status: 'running', title, text, truncated, ...tag });
      }
      if (!isCurrent()) return;
      const usage = await this.usageOf(settings, Math.max(0, now() - startedAt), tokens as TokenUsage | null);
      if (!isCurrent()) return;
      const historyId = await this.keep(tabId, article, settings, text, kind, usage);
      if (!isCurrent()) return;
      await setCached(tabId, { key, title, text, truncated, ...tag, usage, ...(historyId ? { historyId } : {}) });
      set({ status: 'done', title, text, truncated, ...tag, usage });
    } catch (error) {
      set(errorState(codeOf(error), { title, text, truncated, url: tag.url }, kind, detailOf(error)));
    } finally {
      if (this.running.get(tabId)?.controller === controller) this.running.delete(tabId);
    }
  }

  /** After a service worker restart nothing is in memory; show the tab's last summary again. */
  private async restore(tabId: number): Promise<void> {
    const entry = await getLastCached(tabId);
    if (entry && !this.states.has(tabId)) {
      const tag: Source = { ...(entry.source === 'selection' ? { source: 'selection' as const } : {}), ...(entry.url ? { url: entry.url } : {}) };
      const qa = entry.qa?.length ? { qa: entry.qa } : {};
      const usage = entry.usage ? { usage: entry.usage } : {};
      this.setState(tabId, { status: 'done', title: entry.title, text: entry.text, truncated: entry.truncated, ...tag, ...qa, ...usage });
    }
  }

  /**
   * Answers a question about the tab's finished summary, under it. One question at a time; a new
   * summary drops the questions and stops an answer in progress.
   */
  async ask(tabId: number, rawQuestion: string): Promise<void> {
    const question = rawQuestion.trim().slice(0, MAX_QUESTION_CHARS);
    const state = this.states.get(tabId);
    if (!question || state?.status !== 'done' || this.asking.has(tabId)) return;

    const generation = this.generations.get(tabId);
    const controller = new AbortController();
    this.asking.set(tabId, controller);
    const isCurrent = () => !controller.signal.aborted && this.generations.get(tabId) === generation;
    const earlier = state.qa ?? [];
    const index = earlier.length;
    const update = (item: QaItem) => {
      const current = this.states.get(tabId);
      if (!isCurrent() || current?.status !== 'done') return;
      const qa = [...(current.qa ?? [])];
      qa[index] = item;
      this.setState(tabId, { ...current, qa });
    };
    update({ question, answer: '', status: 'running' });

    let answer = '';
    try {
      const settings = await this.deps.loadSettings();
      const { article, kind } = await this.contextFor(tabId, state);
      if (!isCurrent()) return;
      const provider = this.deps.getProvider(settings.provider);
      const availability = await provider.checkAvailability();
      if (!availability.ok) return update({ question, answer, status: 'error', code: availability.code });
      const history = earlier.filter((item) => item.status === 'done');
      const prompt = buildQuestionPrompt(article, state.text, history, question, settings.language, kind === 'selection' ? 'selection' : 'article');
      const now = this.deps.now ?? Date.now;
      const startedAt = now();
      let tokens: TokenUsage | null = null;
      const onUsage = (reported: TokenUsage) => (tokens = reported);
      for await (const chunk of provider.summarize(prompt, settings.models[settings.provider], controller.signal, onUsage)) {
        if (!isCurrent()) return;
        answer += chunk;
        update({ question, answer, status: 'running' });
      }
      const usage = await this.usageOf(settings, Math.max(0, now() - startedAt), tokens as TokenUsage | null);
      update({ question, answer, status: 'done', usage });
    } catch (error) {
      update({ question, answer, status: 'error', code: codeOf(error) });
    } finally {
      if (this.asking.get(tabId) === controller) this.asking.delete(tabId);
      if (isCurrent()) await this.saveQuestions(tabId);
    }
  }

  /** The text to answer from: the one summarized, or after a service worker restart the page again. */
  private async contextFor(tabId: number, state: { title: string; text: string } & Source): Promise<{ article: Article; kind: Kind }> {
    const known = this.articles.get(tabId);
    if (known) return known;
    if (state.source === 'selection') {
      // The selection is gone with the restart; the summary of it is what is left.
      return { article: { title: state.title, url: '', text: state.text, truncated: false }, kind: 'selection' };
    }
    const article = await this.deps.extract(tabId);
    if (!article) throw new SummaryError('no_content');
    this.articles.set(tabId, { article, kind: 'page' });
    return { article, kind: 'page' };
  }

  /** Keeps the answered questions with the cached summary, so a reopened view shows them. */
  private async saveQuestions(tabId: number): Promise<void> {
    const state = this.states.get(tabId);
    const entry = await getLastCached(tabId);
    if (!entry || state?.status !== 'done') return;
    const qa = (state.qa ?? []).filter((item) => item.status !== 'running');
    await setCached(tabId, { ...entry, qa });
    const historyId = this.historyIds.get(tabId) ?? entry.historyId;
    if (historyId) await this.deps.history?.updateQuestions(historyId, qa).catch(() => {});
  }

  /** The time and tokens of a summary, with its approximate cost at API prices when it can be known. */
  private async usageOf(settings: Settings, ms: number, tokens: TokenUsage | null): Promise<SummaryUsage> {
    const usage: SummaryUsage = { ms, ...(tokens ?? {}) };
    if (settings.provider === 'ollama') usage.local = true;
    else if (settings.provider === 'codex' && tokens && usage.costUsd === undefined) {
      const prices = await this.deps.prices?.().catch(() => null);
      const cost = openAiCost(tokens, settings.models.codex, prices ?? null);
      if (cost !== null) usage.costUsd = cost;
    }
    return usage;
  }

  /** Adds a finished summary to the history, when it is on; resolves to its id. */
  private async keep(tabId: number, article: Article, settings: Settings, text: string, kind: Kind, usage: SummaryUsage): Promise<string | undefined> {
    this.historyIds.delete(tabId);
    if (!this.deps.history || settings.keepHistory === false) return undefined;
    try {
      const id = await this.deps.history.add({
        url: article.url,
        title: article.title,
        text,
        truncated: article.truncated,
        ...(kind === 'selection' ? { source: 'selection' as const } : {}),
        ...(article.format ? { format: article.format } : {}),
        provider: settings.provider,
        model: settings.models[settings.provider],
        length: settings.length,
        language: settings.language,
        ...(settings.style !== STANDARD_STYLE ? { style: styleOf(settings) } : {}),
        usage,
      });
      this.historyIds.set(tabId, id);
      return id;
    } catch {
      return undefined;
    }
  }

  private bumpGeneration(tabId: number): number {
    this.asking.get(tabId)?.abort();
    this.asking.delete(tabId);
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
  { url, ...content }: { title: string; text: string; truncated: boolean; url?: string },
  kind: Kind,
  detail?: string,
): SummaryState {
  return {
    status: 'error',
    code,
    ...content,
    ...(url ? { url } : {}),
    ...(detail ? { detail } : {}),
    ...(kind === 'selection' ? { source: 'selection' as const } : {}),
  };
}

/** The style for the history: built-in ones by id (named in the interface), custom ones by name. */
function styleOf(settings: Settings): { id: string; name?: string } {
  const custom = settings.customStyles.find((s) => s.id === settings.style);
  return custom ? { id: custom.id, name: custom.name } : { id: settings.style };
}

function detailOf(error: unknown): string | undefined {
  if (error instanceof SummaryError) return error.message !== error.code ? error.message : undefined;
  return error instanceof Error ? error.message : undefined;
}

function codeOf(error: unknown): SummaryErrorCode {
  return error instanceof SummaryError ? error.code : 'provider_failed';
}
