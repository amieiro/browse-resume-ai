// End-to-end check in Firefox: installs the test build (BRA_E2E=1, see wxt.config.ts) in a temporary
// profile and, through the native host installed on this computer, checks the settings page, the
// model lists, the price list and a summary of an article and of a PDF with Claude (haiku).
// Run with: npm run test:firefox (needs Firefox and ./native-host/install.sh run first).
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import puppeteer from 'puppeteer-core';

const FIREFOX = process.env.FIREFOX_BIN ?? (process.platform === 'darwin' ? '/Applications/Firefox.app/Contents/MacOS/firefox' : 'firefox');
const ADDON_ID = 'browse-resume-ai@amieiro.github.io';
// A fixed internal UUID, so the test knows the moz-extension:// address of the add-on's pages.
const UUID = '6f1d2c3a-1111-4222-8333-944455556666';
const PAGES = ['https://en.wikipedia.org/wiki/Galician_language', 'https://arxiv.org/pdf/1706.03762'];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failed = false;
const fail = (message) => {
  console.error(`FAIL: ${message}`);
  failed = true;
};

const profile = mkdtempSync(join(tmpdir(), 'bra-firefox-'));
const browser = await puppeteer.launch({
  browser: 'firefox',
  executablePath: FIREFOX,
  headless: true,
  userDataDir: profile,
  args: ['--new-instance', '--no-remote'],
  // WebDriver BiDi only reaches extension pages with system access.
  env: { ...process.env, MOZ_REMOTE_ALLOW_SYSTEM_ACCESS: '1' },
  extraPrefsFirefox: { 'extensions.webextensions.uuids': JSON.stringify({ [ADDON_ID]: UUID }) },
});
try {
  const id = await browser.installExtension(join(process.cwd(), '.output/firefox-mv3-e2e'));
  if (id !== ADDON_ID) fail(`add-on id ${id}`);
  console.log(`add-on installed: ${id}`);

  // The test build opens its settings page when it starts.
  let page;
  for (let i = 0; i < 40 && !page; i++) {
    await sleep(250);
    for (const p of await browser.pages()) {
      if ((await p.evaluate(() => location.href).catch(() => '')).startsWith(`moz-extension://${UUID}/options.html`)) page = p;
    }
  }
  if (!page) throw new Error('the settings page did not open');
  await page.waitForFunction(
    () => {
      const rows = [...document.querySelectorAll('[data-status]')];
      return rows.length === 3 && rows.every((s) => s.textContent !== '…');
    },
    { timeout: 20_000 },
  );
  const statuses = Object.fromEntries(await page.$$eval('[data-status]', (els) => els.map((e) => [e.dataset.status, e.textContent])));
  console.log(statuses);
  if (statuses.claude !== 'Ready') fail('Claude is not ready: is the native host installed for Firefox?');

  await page.waitForFunction(async () => !!(await browser.storage.local.get('modelCatalog')).modelCatalog, { timeout: 30_000 }).catch(() => {});
  const models = await page.evaluate(async () => (await browser.storage.local.get('modelCatalog')).modelCatalog?.models);
  console.log(`model lists: ${JSON.stringify(models)}`);
  if (!models?.claude?.length) fail('the model lists were not read from the host');
  await page.waitForFunction(async () => !!(await browser.storage.local.get('apiPrices')).apiPrices, { timeout: 60_000 }).catch(() => {});
  const prices = await page.evaluate(async () => Object.keys((await browser.storage.local.get('apiPrices')).apiPrices?.openai ?? {}).length);
  console.log(`API prices: ${prices} models`);
  if (!prices) fail('the API prices were not downloaded');

  await page.evaluate(async () => {
    const s = (await browser.storage.local.get('settings')).settings ?? {};
    await browser.storage.local.set({ settings: { ...s, length: 'short', provider: 'claude', models: { ...s.models, claude: 'haiku' } } });
  });
  for (const url of PAGES) {
    const tab = await browser.newPage();
    await tab.goto(url, { waitUntil: 'load', timeout: 60_000 }).catch(() => {});
    await sleep(2000);
    // Ask the background for a summary as the side panel does, through a port named after the tab.
    const result = await page.evaluate(
      (u) =>
        new Promise(async (resolve) => {
          const target = (await browser.tabs.query({})).find((t) => t.url === u);
          if (!target) return resolve({ status: 'no tab' });
          const port = browser.runtime.connect({ name: `summary:${target.id}` });
          setTimeout(() => resolve({ status: 'timeout' }), 120_000);
          port.onMessage.addListener(({ state }) => {
            if (state.status === 'done' || state.status === 'error') {
              port.disconnect();
              resolve({ status: state.status, code: state.code, detail: state.detail, text: state.text, usage: state.usage });
            }
          });
          port.postMessage({ type: 'start', force: true });
        }),
      url,
    );
    console.log(`${url}: ${result.status}${result.code ? ` (${result.code}: ${result.detail})` : ''} ${JSON.stringify(result.usage ?? {})}`);
    if (result.status !== 'done' || !result.text) fail(`no summary of ${url}`);
    else console.log(`  ${result.text.slice(0, 140)}…`);
    await tab.close();
  }
} catch (error) {
  fail(error.message);
} finally {
  await browser.close();
  rmSync(profile, { recursive: true, force: true });
}
if (failed) process.exit(1);
console.log('OK');
