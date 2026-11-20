import { beforeEach, describe, expect, it } from 'vitest';
import { extractYouTube, isYouTubeVideo } from '@/lib/youtube';

const segment = (time: string, text: string) =>
  `<transcript-segment-view-model><div class="ytwTranscriptSegmentViewModelTimestamp">${time}</div>` +
  `<div class="ytwTranscriptSegmentViewModelTimestampA11yLabel">${time} seconds</div>` +
  `<span class="ytAttributedStringHost">${text}</span></transcript-segment-view-model>`;
const chapter = (title: string) => `<timeline-chapter-view-model><h3>${title}</h3><span>0:00</span></timeline-chapter-view-model>`;
const panel = [chapter('Intro'), segment('0:01', 'So in college,'), segment('0:05', 'I wrote papers.'), chapter('The monkey'), segment('1:00', 'Then came the monkey.')].join('');

beforeEach(() => {
  document.title = 'Inside the Mind of a Master Procrastinator - YouTube';
  document.body.innerHTML = '';
});

describe('isYouTubeVideo', () => {
  it.each([
    ['https://www.youtube.com/watch?v=arj7oStGLkU', true],
    ['https://m.youtube.com/watch?v=x', true],
    ['https://www.youtube.com/', false],
    ['https://www.youtube.com/watch', false],
    ['https://notyoutube.com/watch?v=x', false],
  ])('%s → %s', (url, expected) => {
    expect(isYouTubeVideo(url)).toBe(expected);
  });
});

describe('extractYouTube', () => {
  it('reads an open transcript, with the chapters as headings', async () => {
    document.body.innerHTML = `<h1 class="ytd-watch-metadata">Inside the Mind</h1><div>${panel}</div>`;
    const a = await extractYouTube(document, 'https://www.youtube.com/watch?v=abc&t=42s');
    expect(a).toEqual({
      title: 'Inside the Mind',
      text: '## Intro\n\nSo in college, I wrote papers.\n\n## The monkey\n\nThen came the monkey.',
      url: 'https://www.youtube.com/watch?v=abc',
      truncated: false,
      format: 'video',
    });
  });

  it('opens Show transcript when the panel is closed, and waits for it', async () => {
    document.body.innerHTML = `<ytd-video-description-transcript-section-renderer><button>Show transcript</button></ytd-video-description-transcript-section-renderer><div id="panel"></div>`;
    document.querySelector('button')!.addEventListener('click', () => {
      setTimeout(() => (document.getElementById('panel')!.innerHTML = panel), 400);
    });
    const a = await extractYouTube(document, 'https://www.youtube.com/watch?v=abc', 3000);
    expect('text' in a && a.text).toContain('Then came the monkey.');
    expect('title' in a && a.title).toBe('Inside the Mind of a Master Procrastinator');
  });

  it('reports a video without a transcript button', async () => {
    document.body.innerHTML = '<h1>No captions here</h1>';
    expect(await extractYouTube(document, 'https://www.youtube.com/watch?v=abc')).toEqual({ noTranscript: true });
  });

  it('reports a transcript that never loads', async () => {
    document.body.innerHTML = `<ytd-video-description-transcript-section-renderer><button>Show transcript</button></ytd-video-description-transcript-section-renderer>`;
    expect(await extractYouTube(document, 'https://www.youtube.com/watch?v=abc', 300)).toEqual({ noTranscript: true });
  });
});
