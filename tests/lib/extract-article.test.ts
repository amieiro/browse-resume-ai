import { describe, expect, it } from 'vitest';
import { extractArticle, MAX_ARTICLE_CHARS } from '@/lib/extract-article';

function doc(html: string): Document {
  return new DOMParser().parseFromString(html, 'text/html');
}

const words = (n: number, seed: string) => Array.from({ length: n }, (_, i) => `${seed}${i}`).join(' ');
const paragraphs = Array.from({ length: 5 }, (_, i) => `<p>${words(100, `p${i}w`)}.</p>`).join('');
const articlePage = `<html><head><title>Page title</title></head><body>
  <nav><a href="/">Home</a><a href="/login">NavLoginLabel</a></nav>
  <article><h1>Real headline</h1>${paragraphs}</article>
  <footer>FooterCopyright</footer></body></html>`;

describe('extractArticle', () => {
  it('returns the article text without the page chrome', () => {
    const a = extractArticle(doc(articlePage), 'https://e.com/a');
    expect(a).not.toBeNull();
    expect(a!.text).toContain('p0w0');
    expect(a!.text).toContain('p4w99');
    expect(a!.text).not.toContain('NavLoginLabel');
    expect(a!.title).toMatch(/Real headline|Page title/);
    expect(a!.url).toBe('https://e.com/a');
    expect(a!.truncated).toBe(false);
  });

  it('does not mutate the original document', () => {
    const d = doc(articlePage);
    extractArticle(d, 'https://e.com/a');
    expect(d.querySelector('nav')).not.toBeNull();
  });

  it('falls back to <main> when Readability finds nothing', () => {
    const sentence = 'This is a plain sentence with enough words to read as prose. ';
    const d = doc(`<body><main><div>${sentence.repeat(12)}</div></main></body>`);
    const a = extractArticle(d, 'https://e.com/m');
    expect(a).not.toBeNull();
    expect(a!.text).toContain('This is a plain sentence');
  });

  it('cuts long text at the cap and marks it truncated', () => {
    const long = Array.from({ length: 300 }, (_, i) => `<p>${'Lorem ipsum dolor sit amet, consectetur adipiscing elit. '.repeat(10)}${i}</p>`).join('');
    const a = extractArticle(doc(`<body><article>${long}</article></body>`), 'https://e.com/l');
    expect(a!.text.length).toBe(MAX_ARTICLE_CHARS);
    expect(a!.truncated).toBe(true);
  });

  it('returns null for a web app shell with no article text', () => {
    expect(extractArticle(doc('<body><nav>Home Login Pricing</nav><div id="app"></div></body>'), 'https://e.com/app')).toBeNull();
  });

  it('returns null for a whitespace-only body', () => {
    expect(extractArticle(doc('<body>   \n  </body>'), 'https://e.com/w')).toBeNull();
  });

  it('returns null for a login wall with a form and a cookie notice', () => {
    const html = `<body><header>Brand</header><main>
      <h1>Sign in to continue</h1>
      <form><label>Email address</label><input type="email"><label>Password</label><input type="password">
      <button>Sign in</button><a href="/forgot">Forgot your password?</a><a href="/join">Create an account</a></form>
      <div class="cookies">We use cookies to improve your experience. By continuing you accept our cookie policy. <button>Accept all</button><button>Reject</button></div>
      </main></body>`;
    expect(extractArticle(doc(html), 'https://e.com/login')).toBeNull();
  });

  it('returns null for an app shell with a link sidebar and a table of labels', () => {
    const links = Array.from({ length: 30 }, (_, i) => `<a href="/f${i}">Folder number ${i}</a>`).join('');
    const rows = Array.from({ length: 20 }, (_, i) => `<tr><td>Sender ${i}</td><td>Subject line ${i}</td><td>10:${i} AM</td></tr>`).join('');
    const html = `<body><div class="sidebar">${links}</div><div class="list"><table>${rows}</table></div></body>`;
    expect(extractArticle(doc(html), 'https://e.com/mail')).toBeNull();
  });

  it('ignores hidden text in the fallback', () => {
    const sentence = 'This is a plain sentence with enough words to read as prose. ';
    const html = `<body><main><div hidden>${sentence.repeat(12)}</div><div style="display:none">${sentence.repeat(12)}</div><p>Menu</p></main></body>`;
    expect(extractArticle(doc(html), 'https://e.com/h')).toBeNull();
  });

  describe('floating overlays (consent dialogs, newsletter pop-ups)', () => {
    const sentences = (n: number, seed: string) =>
      Array.from({ length: n }, (_, i) => `<p>${words(12, `${seed}${i}w`)} goes on for a while here.</p>`).join('');
    const live = (html: string) => {
      document.body.innerHTML = html;
      return document;
    };

    it('skips a fixed overlay that has more text than the article', () => {
      const d = live(`<div style="position: fixed; inset: 0">${sentences(12, 'consent')}</div>
        <article><h1>Short paid article</h1>${sentences(5, 'story')}</article>`);
      const a = extractArticle(d, 'https://e.com/paywalled');
      expect(a!.text).toContain('story0w0');
      expect(a!.text).not.toContain('consent0w0');
    });

    it('still reads an article that is itself inside a fixed container', () => {
      const d = live(`<div style="position: fixed; inset: 0"><article><h1>Reader view</h1>${sentences(8, 'reader')}</article></div>`);
      expect(extractArticle(d, 'https://e.com/reader')!.text).toContain('reader0w0');
    });

    it('leaves the live page untouched', () => {
      const d = live(`<div id="overlay" style="position: fixed">${sentences(12, 'consent')}</div><article>${sentences(5, 'story')}</article>`);
      extractArticle(d, 'https://e.com/paywalled');
      expect(d.getElementById('overlay')).not.toBeNull();
    });
  });
});

