import { browser } from 'wxt/browser';
import type { ProviderId } from './settings';

/**
 * The models each provider offers on this computer, as the local host read them from Claude Code,
 * Codex and Ollama. Kept in storage.local and read again once a day, when the extension is
 * installed or updated, and when Claude Code or Codex changed version (checked at most hourly).
 */
export interface ModelCatalog {
  checkedAt: number;
  extensionVersion: string;
  versions: { claude: string | null; codex: string | null };
  models: Partial<Record<ProviderId, string[]>>;
  /** When the CLI versions were last compared with the ones above. */
  versionsCheckedAt: number;
}

/** What the host answers to { type: 'models' }. */
export interface HostModels {
  claude: { version: string | null; models: string[] | null };
  codex: { version: string | null; models: string[] | null };
  ollama: { found: boolean; models: string[] };
}

export interface CatalogDeps {
  listModels(): Promise<HostModels | null>;
  cliVersions(): Promise<{ claude: string | null; codex: string | null } | null>;
  now(): number;
  extensionVersion: string;
}

export const CATALOG_KEY = 'modelCatalog';
export const DAY_MS = 24 * 60 * 60 * 1000;
export const VERSION_CHECK_MS = 60 * 60 * 1000;

export async function getCatalog(): Promise<ModelCatalog | null> {
  const result = await browser.storage.local.get(CATALOG_KEY);
  return (result[CATALOG_KEY] as ModelCatalog | undefined) ?? null;
}

/** Too old, or made by another version of the extension. */
export function isStale(catalog: ModelCatalog | null, now: number, extensionVersion: string): boolean {
  return !catalog || now - catalog.checkedAt >= DAY_MS || now < catalog.checkedAt || catalog.extensionVersion !== extensionVersion;
}

/**
 * Reads the lists from the host and stores them. A list the host could not read (null, or Ollama
 * not running) keeps the previous one. Resolves to null, storing nothing, when the host is missing.
 */
export async function refreshCatalog(deps: CatalogDeps): Promise<ModelCatalog | null> {
  const answer = await deps.listModels();
  if (!answer) return null;
  const previous = await getCatalog();
  const pick = (fresh: string[] | null | undefined, id: ProviderId) => (fresh?.length ? fresh : previous?.models[id]);
  const models: Partial<Record<ProviderId, string[]>> = {};
  const claude = pick(answer.claude.models, 'claude');
  const codex = pick(answer.codex.models, 'codex');
  // Ollama running with no models means none; not running keeps the models last seen.
  const ollama = answer.ollama.found ? answer.ollama.models : previous?.models.ollama;
  if (claude) models.claude = claude;
  if (codex) models.codex = codex;
  if (ollama) models.ollama = ollama;
  const now = deps.now();
  const catalog: ModelCatalog = {
    checkedAt: now,
    versionsCheckedAt: now,
    extensionVersion: deps.extensionVersion,
    versions: { claude: answer.claude.version, codex: answer.codex.version },
    models,
  };
  await browser.storage.local.set({ [CATALOG_KEY]: catalog });
  return catalog;
}

let pending: Promise<ModelCatalog | null> | null = null;

/** Refreshes the catalog when it is stale or a CLI changed version; one check at a time. */
export function ensureFreshCatalog(deps: CatalogDeps): Promise<ModelCatalog | null> {
  pending ??= (async () => {
    const catalog = await getCatalog();
    const now = deps.now();
    if (isStale(catalog, now, deps.extensionVersion)) return refreshCatalog(deps);
    if (now - catalog!.versionsCheckedAt < VERSION_CHECK_MS) return catalog;
    const versions = await deps.cliVersions();
    if (versions && (versions.claude !== catalog!.versions.claude || versions.codex !== catalog!.versions.codex)) {
      return refreshCatalog(deps);
    }
    const checked = { ...catalog!, versionsCheckedAt: now };
    await browser.storage.local.set({ [CATALOG_KEY]: checked });
    return checked;
  })().finally(() => {
    pending = null;
  });
  return pending;
}
