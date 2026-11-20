// @vitest-environment node
import { copyFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { commandFor, resolveCli } from '../lib/resolve-cli.mjs';

const SHIMS = fileURLToPath(new URL('./fixtures/shims/', import.meta.url));

describe('resolveCli', () => {
  it('turns an npm .cmd shim into the JavaScript file it runs', () => {
    expect(resolveCli(join(SHIMS, 'codex.cmd'))).toBe(join(SHIMS, 'node_modules', '@openai', 'codex', 'bin', 'codex.js'));
  });

  it('is case-insensitive about the extension', () => {
    const dir = mkdtempSync(join(tmpdir(), 'bra-shim-'));
    copyFileSync(join(SHIMS, 'codex.cmd'), join(dir, 'CODEX.CMD'));
    expect(resolveCli(join(dir, 'CODEX.CMD'))).toBe(join(dir, 'node_modules', '@openai', 'codex', 'bin', 'codex.js'));
  });

  it('leaves executables and unknown shims as they are', () => {
    expect(resolveCli('/usr/local/bin/claude')).toBe('/usr/local/bin/claude');
    expect(resolveCli('C:\\Users\\me\\.local\\bin\\claude.exe')).toBe('C:\\Users\\me\\.local\\bin\\claude.exe');
    expect(resolveCli(join(SHIMS, 'other.cmd'))).toBe(join(SHIMS, 'other.cmd'));
  });
});

describe('commandFor', () => {
  it('runs a JavaScript entry point with this Node', () => {
    expect(commandFor('/x/codex.js')).toEqual({ command: process.execPath, prefix: ['/x/codex.js'] });
    expect(commandFor('/x/cli.mjs')).toEqual({ command: process.execPath, prefix: ['/x/cli.mjs'] });
  });

  it('runs anything else directly', () => {
    expect(commandFor('/usr/bin/claude')).toEqual({ command: '/usr/bin/claude', prefix: [] });
  });

  it('refuses .cmd and .bat files, which Node can only start through a shell', () => {
    expect(() => commandFor('C:\\tools\\codex.cmd')).toThrow(/shell/);
    expect(() => commandFor('C:\\tools\\x.BAT')).toThrow(/shell/);
  });
});
