// Generates the gallery screenshots in media/gallery/ for the README: real summaries of real pages,
// in several languages and the three lengths, in the side panel and in the popup.
//
// Each summary is made through the installed native host, as the extension makes it. The page and
// the extension's view are captured separately and put side by side (side panel) or one over the
// other (popup), as Chrome shows them; a script cannot click the toolbar icon to open the real ones.
//
// Usage: npm run dist && node scripts/gallery.mjs [--model sonnet] [--only <name>] [--probe]
//   --only   regenerate one shot (its file name without .png)
//   --probe  only load the pages and save them to the scratch folder, to check banners and extraction
// Requires the native host to be installed (./native-host/install.sh).
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { addBorder } from './add-border.mjs';
import { EXTENSION_DIR, ROOT, argValue, launchChrome, loadPromptBuilder, sleep, summarizeWithHost } from './lib/shots.mjs';

const OUT = join(ROOT, 'media/gallery');
const MODEL = argValue('--model', 'sonnet');
const ONLY = argValue('--only', null);
const PROBE = process.argv.includes('--probe');

const PAGES = {
  securityweek: 'https://www.securityweek.com/php-readies-critical-security-updates-to-patch-another-rce-flaw/',
  newscientist: 'https://www.newscientist.com/article/2528235-pancreatic-cancer-halted-by-virus-injection-in-three-patients/',
  grapheneos: 'https://grapheneos.social/@GrapheneOS/117645038299496084',
  arxiv: 'https://arxiv.org/pdf/1706.03762',
  youtube: 'https://www.youtube.com/watch?v=arj7oStGLkU',
  hackernews: 'https://news.ycombinator.com/item?id=50562754',
};

// One shot per page, length and language; the interface is in the same language as the summary.
const SHOTS = [
  { name: 'securityweek-en-US-short', page: 'securityweek', language: 'en-US', length: 'short', mode: 'panel' },
  { name: 'securityweek-es-ES-medium', page: 'securityweek', language: 'es-ES', length: 'medium', mode: 'popup' },
  { name: 'securityweek-fr-FR-long', page: 'securityweek', language: 'fr-FR', length: 'long', mode: 'panel' },
  { name: 'newscientist-de-DE-short', page: 'newscientist', language: 'de-DE', length: 'short', mode: 'popup' },
  { name: 'newscientist-pt-BR-medium', page: 'newscientist', language: 'pt-BR', length: 'medium', mode: 'panel' },
  { name: 'newscientist-gl-ES-long', page: 'newscientist', language: 'gl-ES', length: 'long', mode: 'panel' },
  { name: 'grapheneos-it-IT-short', page: 'grapheneos', language: 'it-IT', length: 'short', mode: 'panel' },
  { name: 'grapheneos-ja-medium', page: 'grapheneos', language: 'ja', length: 'medium', mode: 'popup' },
  { name: 'grapheneos-ar-long', page: 'grapheneos', language: 'ar', length: 'long', mode: 'panel' },
  // The two features shown in the README next to the summaries above.
  {
    name: 'feature-selection', page: 'securityweek', language: 'en-US', length: 'medium', mode: 'panel',
    // Selects these paragraphs of the article, as a reader would before Summarize the selection.
    select: { from: 'One of the security defects', to: 'PHP said last month' },
  },
  {
    name: 'feature-questions', page: 'grapheneos', language: 'en-US', length: 'short', mode: 'panel',
    questions: ['What does GrapheneOS ask regulators to do?', 'Which phone makers does it mention?'],
  },
  { name: 'feature-pdf', page: 'arxiv', language: 'en-US', length: 'medium', mode: 'panel' },
  // YouTube's cookie notice is rejected like any other; the extractor opens the transcript itself.
  // A summary style: the same article as the first shot, in simple words.
  { name: 'feature-style', page: 'securityweek', language: 'en-US', length: 'medium', mode: 'panel', style: 'simple' },
  // The export menu open over a finished summary.
  { name: 'feature-export', page: 'grapheneos', language: 'en-US', length: 'short', mode: 'panel', exportMenu: true },
  { name: 'feature-thread', page: 'hackernews', language: 'en-US', length: 'medium', mode: 'panel', top: true },
  { name: 'feature-youtube', page: 'youtube', language: 'en-US', length: 'medium', mode: 'panel', top: true },
  // The history page, with short summaries of the pages above.
  { name: 'feature-history', mode: 'history', language: 'en-US', length: 'short', pages: ['arxiv', 'newscientist', 'securityweek'] },
];

const HEIGHT = 820;
const WINDOW_WIDTH = 1280;
const PANEL_WIDTH = 400;
const POPUP_WIDTH = 440;
const POPUP_MAX_HEIGHT = 580;
const SCALE = 2;
// Width at which the README shows each screenshot (the border must look 1px wide there).
const DISPLAY_WIDTH = 800;

// Cookie and consent banners would cover the article; the shots are of the article, so they are
// hidden (the summary is made from the page text either way).
const HIDE_BANNERS = `
  #onetrust-consent-sdk, #onetrust-banner-sdk, .onetrust-pc-dark-filter, #didomi-host, .fc-consent-root,
  [id^="sp_message_container"], .qc-cmp2-container, #usercentrics-root, #CybotCookiebotDialog,
  .cky-consent-container, .cky-overlay, #cmplz-cookiebanner-container, .tp-modal, .tp-backdrop,
  [aria-label*="cookie" i][role="dialog"], [class*="cookie-banner" i], [id*="cookie-banner" i]
  { display: none !important; }
  html, body { overflow: auto !important; }
`;

async function openArticle(browser, url, width) {
  const page = await browser.newPage();
  await page.setViewport({ width, height: HEIGHT, deviceScaleFactor: SCALE });
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }]);
  await page.setBypassCSP(true); // for the banner style below, on sites with a strict CSP
  await page.goto(url, { waitUntil: 'networkidle2', timeout: 60_000 }).catch(() => {});
  await sleep(2000);
  await dismissOverlays(page);
  // Some sites (YouTube) send to a separate consent page first; after rejecting, it goes back.
  if (new URL(page.url()).hostname !== new URL(url).hostname) {
    await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30_000 }).catch(() => {});
    if (new URL(page.url()).hostname !== new URL(url).hostname) await page.goto(url, { waitUntil: 'networkidle2', timeout: 60_000 }).catch(() => {});
    await sleep(2000);
  }
  await page.addStyleTag({ content: HIDE_BANNERS });
  return page;
}

// As a reader would: reject the optional cookies and close promotional pop-ups, in the page and
// in its frames (consent dialogs are often in an iframe). The extractor runs after this, so the
// summary is of the article and not of the consent text.
const DISMISS = /^(reject|reject all|decline|deny|no,? thanks|later|not now|close|×|✕)$/i;

async function dismissOverlays(page) {
  for (let round = 0; round < 3; round++) {
    let clicked = 0;
    for (const frame of page.frames()) {
      if (frame.detached) continue; // ad frames come and go while the page loads
      clicked += await frame
        .evaluate((source) => {
          const re = new RegExp(source, 'i');
          let n = 0;
          const visit = (root) => {
            for (const el of root.querySelectorAll('*')) {
              if (el.shadowRoot) visit(el.shadowRoot);
              const clickable = el.matches('button, a, [role="button"], .close, [aria-label="Close" i]');
              if (!clickable && el.children.length) continue;
              const label = (el.textContent || el.getAttribute('aria-label') || '').trim();
              const r = el.getBoundingClientRect();
              if (r.width && r.height && re.test(label)) {
                el.click();
                n++;
              }
            }
          };
          visit(document);
          return n;
        }, DISMISS.source)
        .catch(() => 0);
    }
    await page.keyboard.press('Escape');
    await sleep(1200);
    if (!clicked) break;
  }
}

/**
 * Scrolls the article's heading near the top, hides what stays floating over the text (newsletter
 * and notification prompts, subscription bars), and takes the screenshot.
 */
async function captureArticle(page, title) {
  await dismissOverlays(page); // some prompts (notifications) appear a while after the page loads
  await page.evaluate((t) => {
    const headings = [...document.querySelectorAll('h1')].filter((h) => h.getBoundingClientRect().height);
    const heading = headings.find((h) => t.includes(h.textContent.trim()) && h.textContent.trim()) ?? null;
    window.scrollTo(0, heading ? Math.max(0, heading.getBoundingClientRect().top + window.scrollY - 200) : 0);
  }, title);
  await sleep(800);
  await hideFloating(page);
  await sleep(300);
  return page.screenshot({ encoding: 'base64' });
}

/** Hides what floats over the text (prompts, bars), keeping the site's header bar. */
async function hideFloating(page) {
  await page.evaluate(() => {
    for (const el of document.querySelectorAll('body *')) {
      const style = getComputedStyle(el);
      if (style.position !== 'fixed' && style.position !== 'sticky') continue;
      // Keep the site's header bar (full width, at the top); hide prompts and bars elsewhere.
      const r = el.getBoundingClientRect();
      const header = r.top <= 1 && r.width >= window.innerWidth * 0.9 && r.height < window.innerHeight / 3;
      if (!header) el.style.setProperty('display', 'none', 'important');
    }
  });
}

/**
 * Selects the paragraphs from the one that contains `from` to the one that contains `to`, scrolls
 * them into view and returns the selected text (what Summarize the selection reads).
 */
async function selectParagraphs(page, { from, to }) {
  const text = await page.evaluate((a, b) => {
    const paragraphs = [...document.querySelectorAll('p')];
    const first = paragraphs.find((p) => p.textContent.includes(a));
    const last = paragraphs.find((p) => p.textContent.includes(b));
    if (!first || !last) return null;
    window.scrollTo(0, first.getBoundingClientRect().top + window.scrollY - 260);
    const range = document.createRange();
    range.setStartBefore(first);
    range.setEndAfter(last);
    getSelection().removeAllRanges();
    getSelection().addRange(range);
    return getSelection().toString();
  }, from, to);
  if (!text) throw new Error(`Paragraphs not found: ${from} … ${to}`);
  return text;
}

/** The extension's summary view for this shot, with the given summary restored from session storage. */
async function captureView(browser, id, shot, entry) {
  const view = await browser.newPage();
  const width = shot.mode === 'panel' ? PANEL_WIDTH : POPUP_WIDTH;
  const height = shot.mode === 'panel' ? HEIGHT : POPUP_MAX_HEIGHT;
  await view.setViewport({ width, height, deviceScaleFactor: SCALE });
  await view.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }]);
  await view.goto(`chrome-extension://${id}/sidepanel.html`);
  await view.evaluate(
    async (s, e) => {
      await chrome.storage.local.set({
        settings: {
          displayMode: s.mode === 'panel' ? 'sidepanel' : 'popup',
          uiLanguage: s.language,
          language: s.language,
          length: s.length,
          style: s.style ?? 'standard',
          provider: 'claude',
          models: { claude: s.model, codex: 'gpt-6.2-sol' },
        },
      });
      // The view restores the tab's last summary from session storage (as after a service worker
      // restart), which shows the real summary without the toolbar click a script cannot make.
      const tab = await chrome.tabs.getCurrent();
      await chrome.storage.session.set({ [`summary:${tab.id}`]: e });
    },
    { ...shot, model: MODEL },
    entry,
  );
  await view.reload();
  await sleep(1500);
  // Questions are under the summary: scroll to show the end of the summary and the answers.
  if (entry.qa) {
    await view.evaluate(() => {
      const first = document.querySelector('.qa-item');
      const toolbar = document.querySelector('.toolbar').getBoundingClientRect().height;
      if (first) window.scrollTo(0, first.getBoundingClientRect().top + window.scrollY - toolbar - 140);
    });
  }
  if (shot.exportMenu) await view.click('button[name="export"]');
  await sleep(300);
  let clip;
  if (shot.mode === 'popup') {
    // The popup page is the side panel page with the popup's size, which is what the popup shows.
    const contentHeight = await view.evaluate(() => {
      document.body.classList.add('popup');
      return Math.ceil(document.getElementById('app').getBoundingClientRect().height);
    });
    clip = { x: 0, y: 0, width, height: Math.min(contentHeight, height) };
  }
  const png = await view.screenshot({ encoding: 'base64', clip });
  await view.close();
  return { png, width, height: clip ? clip.height : height };
}

/** The history page with real summaries of some pages (one with a question), newest first. */
async function historyShot(browser, id, shot, read, buildPrompt, buildQuestionPrompt) {
  const entries = [];
  let when = Date.UTC(2026, 10, 20, 9, 15);
  for (const name of shot.pages) {
    const article = await read(name);
    console.log(`summarizing ${name} for the history...`);
    let usage;
    const text = await summarizeWithHost(buildPrompt(article, shot.length, shot.language), { model: MODEL, onUsage: (u) => (usage = u) });
    const entry = {
      usage,
      id: name, createdAt: when, url: article.url, title: article.title, text, truncated: article.truncated,
      provider: 'claude', model: MODEL, length: shot.length, language: shot.language,
      ...(article.format ? { format: article.format } : {}),
    };
    if (name === 'newscientist') {
      const question = 'How many patients were treated?';
      let answerUsage;
      const answer = await summarizeWithHost(buildQuestionPrompt(article, text, [], question, shot.language), { model: MODEL, onUsage: (u) => (answerUsage = u) });
      entry.qa = [{ question, answer, status: 'done', usage: answerUsage }];
    }
    entries.unshift(entry);
    when += 47 * 60 * 1000;
  }
  const page = await browser.newPage();
  await page.setViewport({ width: 900, height: HEIGHT, deviceScaleFactor: SCALE });
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }]);
  await page.goto(`chrome-extension://${id}/history.html`);
  await page.evaluate(async (list, language) => {
    await chrome.storage.local.set({ history: list, settings: { uiLanguage: language, language } });
  }, entries, shot.language);
  await page.reload();
  await sleep(1500);
  const file = join(OUT, `${shot.name}.png`);
  await page.screenshot({ path: file });
  await page.close();
  execFileSync('sips', ['-Z', String(DISPLAY_WIDTH * 2), file], { stdio: 'ignore' });
  addBorder(file, DISPLAY_WIDTH);
  console.log('wrote', join('media/gallery', `${shot.name}.png`));
}

/** Puts the page and the view together as Chrome shows them, and saves the result. */
async function compose(browser, shot, articlePng, view) {
  const html = shot.mode === 'panel'
    ? `<body style="margin:0;display:flex;background:#fff">
         <img src="data:image/png;base64,${articlePng}" style="width:${WINDOW_WIDTH - PANEL_WIDTH - 1}px;height:${HEIGHT}px">
         <div style="width:1px;background:#c7c7c7"></div>
         <img src="data:image/png;base64,${view.png}" style="width:${PANEL_WIDTH}px;height:${HEIGHT}px">
       </body>`
    : `<body style="margin:0;position:relative;background:#fff">
         <img src="data:image/png;base64,${articlePng}" style="display:block;width:${WINDOW_WIDTH}px;height:${HEIGHT}px">
         <img src="data:image/png;base64,${view.png}" style="position:absolute;top:8px;right:16px;width:${view.width}px;
           height:${view.height}px;border-radius:8px;box-shadow:0 4px 24px rgba(0,0,0,.28),0 0 0 1px rgba(0,0,0,.12)">
       </body>`;
  const page = await browser.newPage();
  await page.setViewport({ width: WINDOW_WIDTH, height: HEIGHT, deviceScaleFactor: SCALE });
  await page.setContent(html, { waitUntil: 'load' });
  const file = join(OUT, `${shot.name}.png`);
  await page.screenshot({ path: file });
  await page.close();
  // Twice the width the README shows, which keeps it sharp on high density screens at a third of the size.
  execFileSync('sips', ['-Z', String(DISPLAY_WIDTH * 2), file], { stdio: 'ignore' });
  addBorder(file, DISPLAY_WIDTH);
  console.log('wrote', join('media/gallery', `${shot.name}.png`));
}

mkdirSync(OUT, { recursive: true });
const { browser, close } = await launchChrome({ viewport: { width: WINDOW_WIDTH, height: HEIGHT, deviceScaleFactor: SCALE } });
const extractScript = readFileSync(join(EXTENSION_DIR, 'extract.js'), 'utf8');

try {
  if (PROBE) {
    const dir = join(process.env.PROBE_DIR ?? tmpdir(), 'bra-gallery-probe');
    mkdirSync(dir, { recursive: true });
    for (const [name, url] of Object.entries(PAGES)) {
      const page = await openArticle(browser, url, WINDOW_WIDTH);
      const extracted = await page.evaluate(extractScript);
      writeFileSync(join(dir, `${name}.png`), Buffer.from(await captureArticle(page, extracted?.title ?? ''), 'base64'));
      writeFileSync(join(dir, `${name}.txt`), extracted ? `${extracted.title}\n\n${extracted.text}` : 'NO ARTICLE');
      console.log(name, extracted ? `${extracted.text.length} chars, "${extracted.title}"` : 'NO ARTICLE');
    }
    process.exit(0);
  }

  const id = await browser.installExtension(EXTENSION_DIR);
  const buildPrompt = await loadPromptBuilder();
  const buildQuestionPrompt = await loadPromptBuilder('src/lib/question-prompt.ts', 'buildQuestionPrompt');
  const pdfToArticle = await loadPromptBuilder('src/lib/pdf-text.ts', 'pdfToArticle');
  const PRESET_STYLES = await loadPromptBuilder('src/lib/styles.ts', 'PRESET_STYLES');
  // A PDF tab only says it is a PDF; read the file with pdf.js and the extension's own reader.
  const readPdf = async ({ url, title }) => {
    const data = new Uint8Array(await (await fetch(url)).arrayBuffer());
    return pdfToArticle(await getDocument({ data }).promise, url, title);
  };
  const extracted = {};
  for (const shot of SHOTS.filter((s) => !ONLY || s.name === ONLY)) {
    if (shot.mode === 'history') {
      await historyShot(browser, id, shot, async (name) => {
        const page = await openArticle(browser, PAGES[name], WINDOW_WIDTH);
        let article = await page.evaluate(extractScript);
        if (article?.pdf) article = await readPdf(article);
        await page.close();
        return article;
      }, buildPrompt, buildQuestionPrompt);
      continue;
    }
    const width = shot.mode === 'panel' ? WINDOW_WIDTH - PANEL_WIDTH - 1 : WINDOW_WIDTH;
    const page = await openArticle(browser, PAGES[shot.page], width);
    extracted[shot.page] ??= await page.evaluate(extractScript);
    if (extracted[shot.page]?.pdf) extracted[shot.page] = await readPdf(extracted[shot.page]);
    const article = extracted[shot.page];
    if (!article) throw new Error(`No article text extracted from ${PAGES[shot.page]}`);
    console.log(`summarizing ${shot.name} (${shot.length}, ${shot.language}) with ${MODEL}...`);
    let articlePng;
    const entry = { key: 'gallery', title: article.title, url: article.url, truncated: article.truncated };
    if (shot.select) {
      await dismissOverlays(page);
      const selected = await selectParagraphs(page, shot.select);
      const excerpt = { ...article, text: selected, truncated: false };
      entry.text = await summarizeWithHost(buildPrompt(excerpt, shot.length, shot.language, 'selection'), { model: MODEL, onUsage: (u) => (entry.usage = u) });
      Object.assign(entry, { source: 'selection', truncated: false });
      await sleep(500);
      await hideFloating(page);
      await sleep(300);
      articlePng = await page.screenshot({ encoding: 'base64' });
    } else {
      const style = PRESET_STYLES.find((p) => p.id === shot.style)?.instruction ?? '';
      entry.text = await summarizeWithHost(buildPrompt(article, shot.length, shot.language, 'article', style), { model: MODEL, onUsage: (u) => (entry.usage = u) });
      // top: keep the page at the top (the video player) instead of scrolling to the heading.
      articlePng = await captureArticle(page, shot.top ? '' : article.title);
    }
    if (shot.questions) {
      entry.qa = [];
      for (const question of shot.questions) {
        console.log(`  asking: ${question}`);
        const prompt = buildQuestionPrompt(article, entry.text, entry.qa, question, shot.language);
        let usage;
        const answer = await summarizeWithHost(prompt, { model: MODEL, onUsage: (u) => (usage = u) });
        entry.qa.push({ question, answer, status: 'done', usage });
      }
    }
    await page.close();
    const view = await captureView(browser, id, shot, entry);
    await compose(browser, shot, articlePng, view);
  }
} finally {
  await close();
}
