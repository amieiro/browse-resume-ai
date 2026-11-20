// Generates the installation screenshots in media/install/ for the README.
//
// It starts a separate Google Chrome with a new, empty temporary profile (no tabs, accounts or
// other extensions of the user), in English and light mode, and walks through the installation:
// Developer mode, Load unpacked, the installed extension, the settings and a summary. Red boxes
// are drawn and private text (paths with the user name) is blurred in the page itself before each
// screenshot. The summary shown is a real one, made through the installed native host.
//
// Usage: npm run dist && node scripts/screenshots.mjs [--model sonnet]
// Requires the native host to be installed (./native-host/install.sh).
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { addBorder } from './add-border.mjs';
import { EXTENSION_DIR, ROOT, argValue, launchChrome, loadPromptBuilder, sleep, summarizeWithHost } from './lib/shots.mjs';

const OUT = join(ROOT, 'media/install');
const ARTICLE_URL = 'https://en.wikipedia.org/wiki/Galician_language';
const MODEL = argValue('--model', 'sonnet');
const VIEWPORT = { width: 1200, height: 760, deviceScaleFactor: 2 };
const PANEL_VIEWPORT = { width: 420, height: 760, deviceScaleFactor: 2 };

// --- In-page helpers (run inside the page; they search through shadow roots) ---------------------

const HELPERS = `
window.__deep = function deep(selector, root = document) {
  const found = root.querySelector(selector);
  if (found) return found;
  for (const node of root.querySelectorAll('*')) {
    if (node.shadowRoot) {
      const inner = deep(selector, node.shadowRoot);
      if (inner) return inner;
    }
  }
  return null;
};
window.__allText = function allText(root = document, out = []) {
  for (const node of root.querySelectorAll('*')) {
    if (node.shadowRoot) allText(node.shadowRoot, out);
    if (node.children.length === 0 && node.textContent) out.push(node);
  }
  return out;
};
window.__mark = function mark(el, pad = 6) {
  const r = el.getBoundingClientRect();
  const box = document.createElement('div');
  box.className = '__mark';
  Object.assign(box.style, {
    position: 'fixed', left: r.left - pad + 'px', top: r.top - pad + 'px',
    width: r.width + pad * 2 + 'px', height: r.height + pad * 2 + 'px',
    border: '3px solid #e11d48', borderRadius: '10px', boxSizing: 'border-box',
    zIndex: 2147483647, pointerEvents: 'none',
  });
  document.documentElement.appendChild(box);
};
window.__clearMarks = () => document.querySelectorAll('.__mark').forEach((m) => m.remove());
// Blur any text that contains a local path or the user name.
window.__blurPrivate = function blurPrivate(patterns) {
  for (const el of window.__allText()) {
    if (patterns.some((p) => el.textContent.includes(p))) el.style.filter = 'blur(7px)';
  }
};
`;

async function withHelpers(page) {
  await page.evaluate(HELPERS);
}

async function markDeep(page, selector, pad) {
  const ok = await page.evaluate(
    (s, p) => {
      const el = window.__deep(s);
      if (el) window.__mark(el, p);
      return !!el;
    },
    selector,
    pad,
  );
  if (!ok) throw new Error(`Element not found: ${selector}`);
}

// Width at which the README shows each screenshot (the border must look 1px wide there).
const DISPLAY_WIDTH = { panel: 420, page: 800 };

async function shot(page, name, displayWidth = DISPLAY_WIDTH.page) {
  const user = homedir().split('/').pop();
  await page.evaluate((patterns) => window.__blurPrivate(patterns), [homedir(), `/${user}/`, user]);
  await sleep(300);
  await page.screenshot({ path: join(OUT, name) });
  addBorder(join(OUT, name), displayWidth);
  console.log('wrote', join('media/install', name));
}

// --- Main -----------------------------------------------------------------------------------------

const { browser, close } = await launchChrome({ viewport: VIEWPORT });

try {
  const page = (await browser.pages())[0];
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }]);

  // 1. Developer mode
  await page.goto('chrome://extensions');
  await sleep(800);
  await withHelpers(page);
  await markDeep(page, '#devMode', 4);
  await shot(page, '1-developer-mode.png');

  // 2. Load unpacked
  await page.evaluate(() => {
    window.__clearMarks();
    window.__deep('#devMode').click();
  });
  await sleep(600);
  await markDeep(page, '#loadUnpacked', 6);
  await shot(page, '2-load-unpacked.png');

  // 3. Installed (choosing dist/chrome in the folder picker does the same as this call)
  const id = await browser.installExtension(EXTENSION_DIR);
  await page.reload();
  await sleep(1000);
  await withHelpers(page);
  await markDeep(page, '#extension-id', 6);
  await markDeep(page, '#dev-reload-button', 4);
  await shot(page, '3-installed.png');

  // 4. Settings (US English, whatever the system's region; the model used for the summary below)
  const options = await browser.newPage();
  await options.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }]);
  await options.goto(`chrome-extension://${id}/options.html`);
  await options.evaluate(
    (model) =>
      chrome.storage.local.set({
        settings: { uiLanguage: 'en-US', language: 'en-US', models: { claude: model, codex: 'gpt-6.2-sol' } },
      }),
    MODEL,
  );
  await options.reload();
  await sleep(4000); // provider status checks
  await withHelpers(options);
  await options.evaluate(() => {
    const row = document.querySelector('#uiLanguage').closest('.row');
    window.__mark(row, 6);
    document.querySelectorAll('[data-status]').forEach((s) => window.__mark(s, 4));
  });
  await shot(options, '4-settings.png');

  // 5. A summary, as shown in the side panel
  const article = await browser.newPage();
  await article.goto(ARTICLE_URL, { waitUntil: 'domcontentloaded' });
  const extracted = await article.evaluate(readFileSync(join(EXTENSION_DIR, 'extract.js'), 'utf8'));
  if (!extracted) throw new Error('No article text extracted');
  const buildPrompt = await loadPromptBuilder();
  console.log(`summarizing ${extracted.title} with ${MODEL}...`);
  let usage;
  const text = await summarizeWithHost(buildPrompt(extracted, 'medium', 'en-US'), { model: MODEL, onUsage: (u) => (usage = u) });

  const panel = await browser.newPage();
  await panel.setViewport(PANEL_VIEWPORT);
  await panel.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }]);
  await panel.goto(`chrome-extension://${id}/sidepanel.html`);
  await sleep(800);
  // The panel restores the tab's last summary from session storage (as after a service worker
  // restart), which shows the real summary without the toolbar click a script cannot make.
  await panel.evaluate(
    async (entry) => {
      const tab = await chrome.tabs.getCurrent();
      await chrome.storage.session.set({ [`summary:${tab.id}`]: entry });
    },
    { key: 'screenshot', title: extracted.title, text, truncated: extracted.truncated, usage },
  );
  await panel.reload();
  await sleep(1500);
  await withHelpers(panel);
  await panel.evaluate(() => window.__mark(document.querySelector('.toolbar'), 2));
  await shot(panel, '5-summary.png', DISPLAY_WIDTH.panel);
} finally {
  await close();
}
