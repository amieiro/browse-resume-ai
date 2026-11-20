// @vitest-environment node
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { claudeModels, cliVersion, codexModels } from '../lib/models.mjs';

const fixture = (p) => fileURLToPath(new URL(`./fixtures/${p}`, import.meta.url));
afterEach(() => vi.unstubAllEnvs());

describe('claudeModels', () => {
  it('reads the newest catalog: aliases first, in a fixed order, then the current models', () => {
    expect(claudeModels(fixture('claude-config'), '2.1.329 (Claude Code)')).toEqual([
      'sonnet', 'opus', 'haiku', 'fable',
      'claude-opus-5-5', 'claude-fable-5-2', 'claude-sonnet-5-5', 'claude-haiku-5-5',
    ]);
  });

  it('leaves out earlier versions (overflow) and models that need a newer Claude Code', () => {
    const models = claudeModels(fixture('claude-config'), '2.1.329 (Claude Code)');
    expect(models).not.toContain('claude-opus-4-8');
    expect(models).not.toContain('claude-next-6');
    expect(claudeModels(fixture('claude-config'), '9.1.0 (Claude Code)')).toContain('claude-next-6');
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
