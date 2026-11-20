import { MAX_ARTICLE_CHARS, type Article } from './prompt';

// Discussion threads (Hacker News, Reddit, Lobsters, Discourse forums) are read as a post and its
// comments, each with its author, score and reply depth, so the summary can describe the debate
// rather than a page of loose comments. Only what the page has loaded is read.

interface Comment {
  author: string;
  score?: string;
  depth: number;
  text: string;
}

interface Thread {
  title: string;
  post: Comment;
  comments: Comment[];
}

const clean = (text: string | null | undefined) => (text ?? '').replace(/[ \t ]+/g, ' ').replace(/\s*\n\s*/g, '\n').trim();

/** Text of an element with a line break between paragraphs, without reply links and the like. */
function bodyText(el: Element | null | undefined): string {
  if (!el) return '';
  const copy = el.cloneNode(true) as Element;
  copy.querySelectorAll('.reply, button, script, style').forEach((n) => n.remove());
  copy.querySelectorAll('p, li, pre, blockquote, br').forEach((n) => n.after('\n'));
  return clean(copy.textContent);
}

function hackerNews(doc: Document): Thread | null {
  const item = doc.querySelector('.fatitem');
  if (!item) return null;
  const link = item.querySelector<HTMLAnchorElement>('.titleline > a');
  const title = clean(link?.textContent) || clean(doc.title.replace(/ \| Hacker News$/, ''));
  const external = link && !/^item\?/.test(link.getAttribute('href') ?? '') ? `\nLink: ${link.href}` : '';
  const comments = [...doc.querySelectorAll('tr.athing.comtr')].flatMap((row) => {
    const text = bodyText(row.querySelector('.commtext'));
    if (!text) return [];
    return [{ author: clean(row.querySelector('.hnuser')?.textContent), depth: Number(row.querySelector('td.ind')?.getAttribute('indent') ?? 0), text }];
  });
  return {
    title,
    post: {
      author: clean(item.querySelector('.hnuser')?.textContent),
      score: clean(item.querySelector('.score')?.textContent) || undefined,
      depth: 0,
      text: (bodyText(item.querySelector('.toptext')) + external).trim(),
    },
    comments,
  };
}

function reddit(doc: Document): Thread | null {
  const post = doc.querySelector('shreddit-post');
  if (post) {
    const comments = [...doc.querySelectorAll('shreddit-comment')].flatMap((c) => {
      const text = bodyText(c.querySelector(':scope > [slot="comment"]'));
      if (!text) return [];
      const score = c.getAttribute('score');
      return [{ author: c.getAttribute('author') ?? '', score: score ? `${score} points` : undefined, depth: Number(c.getAttribute('depth') ?? 0), text }];
    });
    const score = post.getAttribute('score');
    return {
      title: post.getAttribute('post-title') ?? clean(doc.querySelector('h1')?.textContent),
      post: {
        author: post.getAttribute('author') ?? '',
        score: score ? `${score} points` : undefined,
        depth: 0,
        text: bodyText(post.querySelector('[slot="text-body"]')),
      },
      comments,
    };
  }
  // Old Reddit.
  const link = doc.querySelector('.thing.link');
  if (!link) return null;
  const comments = [...doc.querySelectorAll('.thing.comment')].flatMap((c) => {
    const text = bodyText(c.querySelector(':scope > .entry .md'));
    if (!text) return [];
    let depth = 0;
    for (let p = c.parentElement; p; p = p.parentElement) if (p.classList.contains('child')) depth++;
    return [{ author: c.getAttribute('data-author') ?? '', score: clean(c.querySelector(':scope > .entry .score.unvoted')?.textContent) || undefined, depth, text }];
  });
  return {
    title: clean(link.querySelector('a.title')?.textContent),
    post: { author: link.getAttribute('data-author') ?? '', depth: 0, text: bodyText(link.querySelector('.expando .md')) },
    comments,
  };
}

function lobsters(doc: Document): Thread | null {
  const story = doc.querySelector('.story');
  if (!story || !doc.querySelector('.comments_subtree, .comment[id^="c_"]')) return null;
  const comments = [...doc.querySelectorAll('.comment[id^="c_"]')].flatMap((c) => {
    const text = bodyText(c.querySelector('.comment_text'));
    if (!text) return [];
    let depth = -1;
    for (let p: Element | null = c; p; p = p.parentElement) if (p.classList.contains('comments_subtree')) depth++;
    const author = [...c.querySelectorAll('.byline a[href^="/~"]')].map((a) => clean(a.textContent)).find(Boolean) ?? '';
    const votes = clean(c.querySelector('.upvoter')?.textContent);
    return [{ author, score: votes ? `${votes} points` : undefined, depth: Math.max(0, depth), text }];
  });
  return {
    title: clean(story.querySelector('.u-url, .link a')?.textContent) || clean(doc.title.replace(/ \| Lobsters$/, '')),
    post: {
      author: clean(story.querySelector('.byline a[href^="/~"]')?.textContent),
      depth: 0,
      text: bodyText(doc.querySelector('.story_text')),
    },
    comments,
  };
}

function discourse(doc: Document): Thread | null {
  const generator = doc.querySelector('meta[name="generator"]')?.getAttribute('content') ?? '';
  const posts = [...doc.querySelectorAll('.topic-post')];
  if (!/^Discourse/i.test(generator) || posts.length === 0) return null;
  const read = (p: Element): Comment => ({
    author: clean(p.querySelector('.names .username, .first.username, .names a')?.textContent),
    depth: p.querySelector('.reply-to-tab') ? 1 : 0,
    text: bodyText(p.querySelector('.cooked')),
  });
  return {
    title: clean(doc.querySelector('.fancy-title, #topic-title h1, h1')?.textContent),
    post: read(posts[0]!),
    comments: posts.slice(1).map(read).filter((c) => c.text),
  };
}

function siteThread(doc: Document, url: string): Thread | null {
  const host = new URL(url).hostname;
  if (host === 'news.ycombinator.com') return hackerNews(doc);
  if (/(^|\.)reddit\.com$/.test(host)) return reddit(doc);
  if (host === 'lobste.rs') return lobsters(doc);
  return discourse(doc);
}

const byline = (c: Comment) => `${c.author || 'anonymous'}${c.score ? ` (${c.score})` : ''}`;

/**
 * The thread in the page as text: the post, then the comments indented by reply depth. Returns
 * null when the page is not a thread of a known kind, or has neither post text nor comments.
 */
export function extractThread(doc: Document, url: string): Article | null {
  let thread: Thread | null;
  try {
    thread = siteThread(doc, url);
  } catch {
    return null;
  }
  if (!thread || (!thread.post.text && thread.comments.length === 0)) return null;
  const lines = [`Post by ${byline(thread.post)}: ${thread.title}`];
  if (thread.post.text) lines.push(thread.post.text);
  if (thread.comments.length) lines.push('', `Comments (${thread.comments.length}, indented by reply depth):`);
  for (const c of thread.comments) {
    const indent = '  '.repeat(Math.min(c.depth, 12));
    lines.push(`${indent}- ${byline(c)}: ${c.text.replace(/\n+/g, ` / `)}`);
  }
  let text = lines.join('\n');
  const truncated = text.length > MAX_ARTICLE_CHARS;
  if (truncated) text = text.slice(0, MAX_ARTICLE_CHARS);
  return { title: thread.title || url, text, url, truncated, format: 'thread' };
}
