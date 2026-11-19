// @vitest-environment node
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runCodex } from '../lib/codex-runner.mjs';

const FAKE = fileURLToPath(new URL('./fixtures/fake-codex.mjs', import.meta.url));

function run(mode, extra = {}) {
  const record = join(mkdtempSync(join(tmpdir(), 'bra-test-')), 'record.json');
  vi.stubEnv('FAKE_MODE', mode);
  vi.stubEnv('FAKE_RECORD', record);
  let text = '';
  const events = [];
  let handle;
  const done = new Promise((resolve) => {
    handle = runCodex({
      codexPath: FAKE,
      model: 'gpt-6-luna',
      prompt: 'THE PROMPT',
      onText: (t) => (text += t),
      onDone: () => (events.push('done'), resolve()),
      onError: (code) => (events.push(`error:${code}`), resolve()),
      ...extra,
    });
  });
  return { done, handle, events, getText: () => text, record };
}

afterEach(() => vi.unstubAllEnvs());

describe('runCodex', () => {
  it('returns the final message', async () => {
    const r = run('ok');
    await r.done;
    expect(r.getText()).toBe('Ola ñandú 🙂\n\n- punto clave');
    expect(r.events).toEqual(['done']);
  });

  it('runs read-only with execution disabled, prompt on stdin', async () => {
    const r = run('ok');
    await r.done;
    const rec = JSON.parse(readFileSync(r.record, 'utf8'));
    expect(rec.argv[0]).toBe('exec');
    expect(rec.argv).toEqual(
      expect.arrayContaining(['--json', '--ephemeral', '--sandbox', 'read-only', '-m', 'gpt-6-luna', '--ignore-user-config']),
    );
    for (const feature of [
      'shell_tool',
      'unified_exec',
      'code_mode_host',
      'view_image',
      'image_generation',
      'goals',
      'browser_use_external',
      'browser_use_full_cdp_access',
      'in_app_local_automation',
      'remote_plugin',
    ]) {
      expect(rec.argv[rec.argv.indexOf(feature) - 1]).toBe('--disable');
    }
    expect(rec.argv.at(-1)).toBe('-');
    expect(rec.argv.join(' ')).not.toContain('THE PROMPT');
    expect(rec.stdin).toBe('THE PROMPT');
  });

  it('maps an authentication failure to codex_signed_out', async () => {
    const r = run('auth');
    await r.done;
    expect(r.events).toEqual(['error:codex_signed_out']);
  });

  it('maps a usage limit to usage_limit', async () => {
    const r = run('limit');
    await r.done;
    expect(r.events).toEqual(['error:usage_limit']);
  });

  it('maps another failure to provider_failed', async () => {
    const r = run('fail');
    await r.done;
    expect(r.events).toEqual(['error:provider_failed']);
  });

  it('maps a missing executable to codex_missing', async () => {
    const r = run('ok', { codexPath: '/nonexistent/codex' });
    await r.done;
    expect(r.events).toEqual(['error:codex_missing']);
  });

  it('cancel kills the child without reporting', async () => {
    const r = run('hang');
    await new Promise((res) => setTimeout(res, 200));
    r.handle.cancel();
    await new Promise((res) => setTimeout(res, 300));
    expect(r.events).toEqual([]);
  });
});
