// The models each provider offers, read from what the CLIs already keep on this computer, so that
// listing them costs no request to the provider and no subscription usage.
//
// - Claude Code has no command to list models, but keeps the model catalog it shows in /model in
//   <config dir>/cache/model-catalog/*-cc.json: aliases that follow the latest model (sonnet, opus,
//   haiku, fable) and the full model names.
// - Codex prints its catalog with `codex debug models`; models with visibility "list" are the ones
//   its picker offers, in priority order.
// Neither format is documented. Anything unexpected gives null, and the extension keeps the list it
// had, so a change in a CLI never breaks summaries.
import { execFile } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { MODEL_PATTERN } from './protocol.mjs';
import { commandFor } from './resolve-cli.mjs';

const ALIAS_ORDER = ['sonnet', 'opus', 'haiku', 'fable'];
const COMMAND_TIMEOUT_MS = 20_000;

const valid = (names) => [...new Set(names.filter((n) => typeof n === 'string' && MODEL_PATTERN.test(n)))];

/** Runs a CLI and resolves to its stdout, or null when it fails, is missing or takes too long. */
function run(path, args) {
  return new Promise((resolve) => {
    let start;
    try {
      start = commandFor(path);
    } catch {
      resolve(null);
      return;
    }
    execFile(start.command, [...start.prefix, ...args], { timeout: COMMAND_TIMEOUT_MS, maxBuffer: 8 * 1024 * 1024, windowsHide: true }, (error, stdout) =>
      resolve(error ? null : stdout),
    );
  });
}

/** First line of `<cli> --version`, or null. */
export async function cliVersion(path) {
  const out = await run(path, ['--version']);
  return out?.split('\n')[0].trim() || null;
}

/** Claude Code's aliases and models from its catalog cache, newest file first; null if none. */
export function claudeModels(configDir = process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude')) {
  const dir = join(configDir, 'cache', 'model-catalog');
  let files;
  try {
    files = readdirSync(dir).filter((f) => f.endsWith('-cc.json'));
  } catch {
    return null;
  }
  const catalogs = files
    .map((f) => {
      try {
        return JSON.parse(readFileSync(join(dir, f), 'utf8'));
      } catch {
        return null;
      }
    })
    .filter((c) => c?.catalog?.config)
    .sort((a, b) => (b.fetchedAt ?? 0) - (a.fetchedAt ?? 0));
  const config = catalogs[0]?.catalog.config;
  if (!config) return null;
  const aliases = Object.keys(config.provider_alias_targets ?? {}).sort((a, b) => {
    const ia = ALIAS_ORDER.indexOf(a);
    const ib = ALIAS_ORDER.indexOf(b);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });
  const models = valid([...aliases, ...(config.models ?? []).map((m) => m?.id)]);
  return models.length ? models : null;
}

/** Codex's listed models, in its priority order; null when the catalog cannot be read. */
export async function codexModels(codexPath) {
  const out = await run(codexPath, ['debug', 'models']);
  if (!out) return null;
  try {
    const list = JSON.parse(out).models ?? [];
    const models = valid(
      list
        .filter((m) => m?.visibility === 'list')
        .sort((a, b) => (a.priority ?? 999) - (b.priority ?? 999))
        .map((m) => m.slug),
    );
    return models.length ? models : null;
  } catch {
    return null;
  }
}
