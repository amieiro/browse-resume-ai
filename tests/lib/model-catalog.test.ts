import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { DAY_MS, ensureFreshCatalog, getCatalog, isStale, refreshCatalog, VERSION_CHECK_MS, type CatalogDeps, type HostModels } from '@/lib/model-catalog';

const answer: HostModels = {
  claude: { version: '2.1.0', models: ['sonnet', 'opus', 'claude-opus-5-5'], labels: { sonnet: 'Sonnet 5.5', opus: 'Opus 5.5' } },
  codex: { version: 'codex-cli 0.169.0', models: ['gpt-6.2-sol', 'gpt-6.1-terra'] },
  ollama: { found: true, models: ['qwen3:4b'] },
};

function deps(over: Partial<CatalogDeps> = {}) {
  let time = 1_000_000;
  const d = {
    listModels: vi.fn(async () => answer as HostModels | null),
    cliVersions: vi.fn(async () => ({ claude: '2.1.0', codex: 'codex-cli 0.169.0' }) as { claude: string | null; codex: string | null } | null),
    now: () => time,
    extensionVersion: '0.7.0',
    ...over,
  };
  return { d, advance: (ms: number) => (time += ms) };
}

beforeEach(() => fakeBrowser.reset());

describe('refreshCatalog', () => {
  it('stores the lists and versions', async () => {
    const { d } = deps();
    await refreshCatalog(d);
    expect(await getCatalog()).toMatchObject({
      checkedAt: 1_000_000,
      extensionVersion: '0.7.0',
      versions: { claude: '2.1.0', codex: 'codex-cli 0.169.0' },
      models: { claude: ['sonnet', 'opus', 'claude-opus-5-5'], codex: ['gpt-6.2-sol', 'gpt-6.1-terra'], ollama: ['qwen3:4b'] },
      labels: { claude: { sonnet: 'Sonnet 5.5', opus: 'Opus 5.5' } },
    });
  });

  it('keeps the previous list of a provider the host could not read', async () => {
    const { d } = deps();
    await refreshCatalog(d);
    vi.mocked(d.listModels).mockResolvedValueOnce({ ...answer, claude: { version: null, models: null }, ollama: { found: false, models: [] } });
    await refreshCatalog(d);
    const c = await getCatalog();
    expect(c!.models.claude).toEqual(['sonnet', 'opus', 'claude-opus-5-5']);
    expect(c!.labels!.claude).toEqual({ sonnet: 'Sonnet 5.5', opus: 'Opus 5.5' });
    expect(c!.models.ollama).toEqual(['qwen3:4b']);
  });

  it('empties the Ollama list when Ollama runs with no models', async () => {
    const { d } = deps();
    await refreshCatalog(d);
    vi.mocked(d.listModels).mockResolvedValueOnce({ ...answer, ollama: { found: true, models: [] } });
    await refreshCatalog(d);
    expect((await getCatalog())!.models.ollama).toEqual([]);
  });

  it('stores nothing when the host is missing', async () => {
    const { d } = deps({ listModels: vi.fn(async () => null) });
    expect(await refreshCatalog(d)).toBeNull();
    expect(await getCatalog()).toBeNull();
  });
});

describe('isStale', () => {
  const base = { checkedAt: 0, versionsCheckedAt: 0, extensionVersion: '1', versions: { claude: null, codex: null }, models: {} };
  it.each([
    [null, 10, '1', true],
    [base, DAY_MS - 1, '1', false],
    [base, DAY_MS, '1', true],
    [base, 10, '2', true],
  ])('%#', (catalog, now, version, stale) => {
    expect(isStale(catalog, now, version)).toBe(stale);
  });
});

describe('ensureFreshCatalog', () => {
  it('reads the lists the first time, then not again within the day', async () => {
    const { d, advance } = deps();
    await ensureFreshCatalog(d);
    advance(10 * 60 * 1000);
    await ensureFreshCatalog(d);
    expect(d.listModels).toHaveBeenCalledTimes(1);
    expect(d.cliVersions).not.toHaveBeenCalled();
  });

  it('reads them again after a day', async () => {
    const { d, advance } = deps();
    await ensureFreshCatalog(d);
    advance(DAY_MS);
    await ensureFreshCatalog(d);
    expect(d.listModels).toHaveBeenCalledTimes(2);
  });

  it('reads them again after an extension update', async () => {
    const { d } = deps();
    await ensureFreshCatalog(d);
    await ensureFreshCatalog({ ...d, extensionVersion: '0.8.0' });
    expect(d.listModels).toHaveBeenCalledTimes(2);
  });

  it('compares the CLI versions hourly and reads the lists again when one changed', async () => {
    const { d, advance } = deps();
    await ensureFreshCatalog(d);
    advance(VERSION_CHECK_MS);
    await ensureFreshCatalog(d);
    expect(d.cliVersions).toHaveBeenCalledTimes(1);
    expect(d.listModels).toHaveBeenCalledTimes(1);
    advance(VERSION_CHECK_MS);
    vi.mocked(d.cliVersions).mockResolvedValueOnce({ claude: '2.2.0', codex: 'codex-cli 0.169.0' });
    await ensureFreshCatalog(d);
    expect(d.listModels).toHaveBeenCalledTimes(2);
  });

  it('runs one check at a time', async () => {
    const { d } = deps();
    await Promise.all([ensureFreshCatalog(d), ensureFreshCatalog(d), ensureFreshCatalog(d)]);
    expect(d.listModels).toHaveBeenCalledTimes(1);
  });
});
