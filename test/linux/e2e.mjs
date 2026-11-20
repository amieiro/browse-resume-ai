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
  // The extension reads the model lists from the host when it is installed; the settings page
  // reloads once when it sees new lists. Wait for them, then open the page for good.
  await page.goto(`chrome-extension://${id}/options.html`);
  await page.waitForFunction(async () => !!(await chrome.storage.local.get('modelCatalog')).modelCatalog, { timeout: 20_000 }).catch(() => {});
  await page.goto(`chrome-extension://${id}/options.html`, { waitUntil: 'networkidle0' });
  const catalog = await page.evaluate(async () => (await chrome.storage.local.get('modelCatalog')).modelCatalog);
  if (!catalog) fail('the model lists were not read from the host');
  console.log(`model lists: ${JSON.stringify(catalog.models)}`);
  if (!catalog.models.codex?.includes('gpt-6.2-sol')) fail('the Codex model list did not reach the extension');
  await page.waitForFunction(
    () => [...document.querySelectorAll('[data-status]')].every((s) => s.textContent !== '…'),
    { timeout: 10_000 },
  );
  const statuses = Object.fromEntries(await page.$$eval('[data-status]', (els) => els.map((e) => [e.dataset.status, e.textContent])));
  console.log(statuses);
  if (statuses.claude !== 'Ready' || statuses.codex !== 'Ready') fail('Claude or Codex is not ready');
  // No Ollama in the container: its row must say so.
  if (!/Ollama/.test(statuses.ollama ?? '')) fail('the Ollama row does not say Ollama is missing');

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
