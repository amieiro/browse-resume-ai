// Loads dist/chrome in Chromium with the default profile (so the host installed in
// ~/.config/chromium is used), then checks the settings page and a summary through the host.
import { homedir } from 'node:os';
import { join } from 'node:path';
import puppeteer from 'puppeteer-core';

const EXPECTED_ID = 'pdokiakaaeffjlabmofdppjakdhaimpi';
const fail = (message) => {
  console.error(`FAIL: ${message}`);
  process.exit(1);
};

const browser = await puppeteer.launch({
  executablePath: '/usr/bin/chromium',
  headless: true,
  pipe: true,
  enableExtensions: true,
  userDataDir: join(homedir(), '.config/chromium'),
  args: ['--no-sandbox', '--lang=en-US'],
});
try {
  const id = await browser.installExtension(join(process.cwd(), 'dist/chrome'));
  if (id !== EXPECTED_ID) fail(`extension id ${id}`);
  console.log(`extension loaded: ${id}`);

  const page = await browser.newPage();
  await page.goto(`chrome-extension://${id}/options.html`);
  await page.waitForFunction(
    () => [...document.querySelectorAll('[data-status]')].every((s) => s.textContent !== '…'),
    { timeout: 10_000 },
  );
  const statuses = await page.$$eval('[data-status]', (els) => els.map((e) => `${e.dataset.status}: ${e.textContent}`));
  console.log(statuses.join('\n'));
  if (!statuses.every((s) => s.endsWith('Ready'))) fail('a provider is not ready');

  for (const provider of ['claude', 'codex']) {
    const text = await page.evaluate(
      (p) =>
        new Promise((resolve, reject) => {
          const port = chrome.runtime.connectNative('com.browse_resume_ai.host');
          let text = '';
          port.onMessage.addListener((m) => {
            if (m.type === 'chunk') text += m.text;
            if (m.type === 'done') (port.disconnect(), resolve(text));
            if (m.type === 'error') reject(new Error(`${m.code}: ${m.message}`));
          });
          port.onDisconnect.addListener(() => reject(new Error(chrome.runtime.lastError?.message ?? 'disconnected')));
          port.postMessage({ type: 'summarize', id: 'e2e', provider: p, model: p === 'claude' ? 'sonnet' : 'gpt-6.2-sol', prompt: 'x' });
        }),
      provider,
    );
    console.log(`${provider} summary through the host: ${JSON.stringify(text)}`);
    if (text !== 'Ola ñandú 🙂\n\n- punto clave') fail(`unexpected ${provider} text`);
  }
} finally {
  await browser.close();
}
