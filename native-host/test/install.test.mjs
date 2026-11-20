// @vitest-environment node
// Runs install.sh from a folder whose name has quotes, a dollar sign, a backtick and spaces, and
// checks that the manifest is valid JSON and that the launcher it points to starts the host.
import { spawn, spawnSync } from 'node:child_process';
import { chmodSync, copyFileSync, cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { createDecoder, encodeMessage } from '../lib/framing.mjs';

const NATIVE_HOST = fileURLToPath(new URL('..', import.meta.url));
const FAKE_CLAUDE = fileURLToPath(new URL('./fixtures/fake-claude.mjs', import.meta.url));
const root = mkdtempSync(join(tmpdir(), 'bra-install-'));
afterAll(() => rmSync(root, { recursive: true, force: true }));

describe.skipIf(process.platform === 'win32')('install.sh', () => {
  it('works from a path with quotes, $, ` and spaces', async () => {
    const weird = join(root, `it's a "test" $HOME \`x\``);
    cpSync(NATIVE_HOST, join(weird, 'native-host'), { recursive: true, filter: (p) => !p.includes(`${'/'}test${'/'}`) || p.endsWith('fixtures') });
    const bin = join(weird, 'bin');
    mkdirSync(bin, { recursive: true });
    copyFileSync(FAKE_CLAUDE, join(bin, 'claude'));
    chmodSync(join(bin, 'claude'), 0o755);
    const home = join(weird, 'home');
    mkdirSync(home);

    const env = { HOME: home, PATH: `${bin}:${dirname(process.execPath)}:/usr/bin:/bin` };
    const install = spawnSync(process.env.TEST_SHELL ?? '/bin/sh', [join(weird, 'native-host', 'install.sh')], { env, encoding: 'utf8' });
    expect(install.status, install.stderr).toBe(0);

    const manifestDir =
      process.platform === 'darwin'
        ? join(home, 'Library/Application Support/Google/Chrome/NativeMessagingHosts')
        : join(home, '.config/google-chrome/NativeMessagingHosts');
    const manifest = JSON.parse(readFileSync(join(manifestDir, 'com.browse_resume_ai.host.json'), 'utf8'));
    expect(manifest.path.startsWith(weird)).toBe(true);
    expect(manifest.allowed_origins).toEqual(['chrome-extension://pdokiakaaeffjlabmofdppjakdhaimpi/']);

    // Firefox gets its own manifest, naming the add-on ID, with the same launcher.
    const firefoxDir =
      process.platform === 'darwin' ? join(home, 'Library/Application Support/Mozilla/NativeMessagingHosts') : join(home, '.mozilla/native-messaging-hosts');
    const firefox = JSON.parse(readFileSync(join(firefoxDir, 'com.browse_resume_ai.host.json'), 'utf8'));
    expect(firefox).toEqual({ name: manifest.name, description: manifest.description, path: manifest.path, type: 'stdio', allowed_extensions: ['browse-resume-ai@amieiro.github.io'] });

    // Chrome starts the launcher with a minimal environment.
    const host = spawn(manifest.path, [], { env: { HOME: home } });
    const pong = await new Promise((resolve, reject) => {
      host.stdout.on('data', createDecoder(resolve));
      host.on('error', reject);
      setTimeout(() => reject(new Error('no answer')), 10_000);
      host.stdin.write(encodeMessage({ type: 'ping' }));
    });
    host.kill();
    expect(pong).toMatchObject({ type: 'pong', claudeFound: true });
  }, 30_000);
});
