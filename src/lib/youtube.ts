import { MAX_ARTICLE_CHARS, type Article } from './prompt';

// YouTube videos are summarized from their transcript, as YouTube shows it in the page: the
// extractor opens "Show transcript" when the panel is closed and reads the segments. It uses no
// YouTube API (the caption URLs in the player now need a token, and the transcript API is internal).

/** What the extractor returns for a video without a transcript. */
export type NoTranscript = { noTranscript: true };

const SEGMENT = 'transcript-segment-view-model, ytd-transcript-segment-renderer';
const CHAPTER = 'timeline-chapter-view-model, ytd-transcript-section-header-renderer';
const SEGMENT_TEXT = '.ytAttributedStringHost, .segment-text, yt-formatted-string';
const SHOW_TRANSCRIPT = 'ytd-video-description-transcript-section-renderer button';
const EXPAND_DESCRIPTION = '#description-inline-expander #expand, tp-yt-paper-button#expand';

export function isYouTubeVideo(url: string): boolean {
  try {
    const { hostname, pathname, searchParams } = new URL(url);
    return /(^|\.)youtube\.com$/.test(hostname) && pathname === '/watch' && searchParams.has('v');
  } catch {
    return false;
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** The segments and chapter titles in page order, as text. */
function readTranscript(doc: Document): string {
  const nodes = doc.querySelectorAll(`${SEGMENT}, ${CHAPTER}`);
  const parts: string[] = [];
  let line: string[] = [];
  const flush = () => {
    if (line.length) parts.push(line.join(' '));
    line = [];
  };
  for (const node of nodes) {
    if (node.matches(CHAPTER)) {
      flush();
      const title = (node.querySelector('h3, .ytwTimelineChapterViewModelTitle, yt-formatted-string') ?? node).textContent?.trim();
      if (title) parts.push(`## ${title}`);
    } else {
      const text = (node.querySelector(SEGMENT_TEXT) ?? node).textContent?.replace(/\s+/g, ' ').trim();
      if (text) line.push(text);
    }
  }
  flush();
  return parts.join('\n\n');
}

function videoTitle(doc: Document): string {
  const heading = doc.querySelector('h1.ytd-watch-metadata, ytd-watch-metadata h1, h1')?.textContent?.trim();
  return heading || doc.title.replace(/ - YouTube$/, '').trim();
}

/**
 * The transcript of the video in the page, opening YouTube's transcript panel if needed. Resolves
 * to NoTranscript when the video has none (no "Show transcript" button, or nothing after waiting).
 */
export async function extractYouTube(doc: Document, url: string, timeoutMs = 10_000): Promise<Article | NoTranscript> {
  if (!doc.querySelector(SEGMENT)) {
    doc.querySelector<HTMLElement>(EXPAND_DESCRIPTION)?.click();
    await sleep(300);
    const button = doc.querySelector<HTMLElement>(SHOW_TRANSCRIPT);
    if (!button) return { noTranscript: true };
    button.click();
    const start = Date.now();
    while (!doc.querySelector(SEGMENT) && Date.now() - start < timeoutMs) await sleep(200);
    // The segments arrive in one go; give the last ones a moment to render.
    await sleep(300);
  }
  let text = readTranscript(doc);
  if (!text) return { noTranscript: true };
  const truncated = text.length > MAX_ARTICLE_CHARS;
  if (truncated) text = text.slice(0, MAX_ARTICLE_CHARS);
  // The link to the video without the time (&t=), so the cache and history see one video.
  const clean = new URL(url);
  clean.searchParams.delete('t');
  return { title: videoTitle(doc), text, url: clean.toString(), truncated, format: 'video' };
}
