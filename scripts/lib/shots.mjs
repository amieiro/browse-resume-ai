// Shared helpers for the screenshot scripts: a separate Chrome with a temporary profile, and real
// summaries made through the installed native host.
import { spawn } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';
import { build } from 'vite';
import { createDecoder, encodeMessage } from '../../native-host/lib/framing.mjs';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export const EXTENSION_DIR = join(ROOT, 'dist/chrome');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const HOST_MANIFEST = join(homedir(), 'Library/Application Support/Google/Chrome/NativeMessagingHosts/com.browse_resume_ai.host.json');
const LAUNCHER = join(homedir(), 'Library/Application Support/browse-resume-ai/launcher.sh');

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** The value after a command line flag, or the fallback. */
export function argValue(flag, fallback) {
  const i = process.argv.indexOf(flag);
  return i === -1 ? fallback : process.argv[i + 1];
}

/**
 * Starts Google Chrome with a new, empty temporary profile (no tabs, accounts or other extensions
 * of the user) that can reach the installed native host. Returns the browser and a cleanup.
 */
export async function launchChrome({ viewport, windowSize = '1280,880' }) {
  const userDataDir = mkdtempSync(join(tmpdir(), 'bra-shots-'));
  // Chrome looks for native messaging hosts in <user-data-dir>/NativeMessagingHosts.
  mkdirSync(join(userDataDir, 'NativeMessagingHosts'), { recursive: true });
  copyFileSync(HOST_MANIFEST, join(userDataDir, 'NativeMessagingHosts', 'com.browse_resume_ai.host.json'));
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: false,
    userDataDir,
    pipe: true,
    enableExtensions: true,
    args: ['--lang=en-US', '--no-first-run', '--no-default-browser-check', `--window-size=${windowSize}`],
    defaultViewport: viewport,
  });
  const close = async () => {
    await browser.close();
    rmSync(userDataDir, { recursive: true, force: true });
  };
  return { browser, close };
}

/** buildPrompt from src/lib/prompt.ts, bundled with Vite so the script uses the extension's prompt. */
export async function loadPromptBuilder() {
  const outDir = mkdtempSync(join(tmpdir(), 'bra-prompt-'));
  await build({
    configFile: false,
    logLevel: 'silent',
    resolve: { alias: { '@': join(ROOT, 'src') } },
    build: {
      outDir,
      lib: { entry: join(ROOT, 'src/lib/prompt.ts'), formats: ['es'], fileName: 'prompt' },
      emptyOutDir: true,
    },
  });
  const mod = await import(join(outDir, 'prompt.js'));
  rmSync(outDir, { recursive: true, force: true });
  return mod.buildPrompt;
}

/** A real summary, through the installed native host, as the extension would get it. */
export function summarizeWithHost(prompt, { provider = 'claude', model }) {
  return new Promise((resolvePromise, reject) => {
    const host = spawn(LAUNCHER, [], { stdio: ['pipe', 'pipe', 'inherit'] });
    let text = '';
    host.stdout.on(
      'data',
      createDecoder((m) => {
        if (m.type === 'chunk') text += m.text;
        else if (m.type === 'done') (host.stdin.end(), resolvePromise(text));
        else if (m.type === 'error') (host.stdin.end(), reject(new Error(`${m.code}: ${m.message}`)));
      }),
    );
    host.stdin.write(encodeMessage({ type: 'summarize', id: 'shot', provider, model, prompt }));
  });
}
