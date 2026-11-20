// @vitest-environment node
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { claudeModels, cliVersion, codexModels } from '../lib/models.mjs';

const fixture = (p) => fileURLToPath(new URL(`./fixtures/${p}`, import.meta.url));
afterEach(() => vi.unstubAllEnvs());

describe('claudeModels', () => {
  it('lists each model once: the aliases, labelled with the model they point to', () => {
    expect(claudeModels(fixture('claude-config'), '2.1.329 (Claude Code)')).toEqual({
      models: ['sonnet', 'opus', 'haiku', 'fable'],
      labels: { sonnet: 'Sonnet 5.5', opus: 'Opus 5.5', haiku: 'Haiku 5.5', fable: 'Fable 5.2' },
    });
  });

  it('adds current models no alias points to, if the installed Claude Code supports them', () => {
    expect(claudeModels(fixture('claude-config'), '2.1.329 (Claude Code)').models).not.toContain('claude-next-6');
    const newer = claudeModels(fixture('claude-config'), '9.1.0 (Claude Code)');
    expect(newer.models).toEqual(['sonnet', 'opus', 'haiku', 'fable', 'claude-next-6']);
    expect(newer.labels['claude-next-6']).toBe('Next');
  });

  it('is null without a catalog', () => {
    expect(claudeModels(fixture('nowhere'))).toBeNull();
  });
});

describe('codexModels', () => {
  it('lists the visible models in priority order and drops invalid names', async () => {
    expect(await codexModels(fixture('fake-codex.mjs'))).toEqual(['gpt-6.2-sol', 'gpt-6.2-astra', 'gpt-6-luna']);
  });

  it('is null when the command fails or the CLI is missing', async () => {
    vi.stubEnv('FAKE_MODELS', 'fail');
    expect(await codexModels(fixture('fake-codex.mjs'))).toBeNull();
    expect(await codexModels('/nonexistent/codex')).toBeNull();
  });
});

describe('cliVersion', () => {
  it('returns the first line of --version', async () => {
    vi.stubEnv('FAKE_VERSION', '2.2.0 (Claude Code)');
    expect(await cliVersion(fixture('fake-claude.mjs'))).toBe('2.2.0 (Claude Code)');
  });

  it('is null for a missing CLI', async () => {
    expect(await cliVersion('/nonexistent/claude')).toBeNull();
  });
});
