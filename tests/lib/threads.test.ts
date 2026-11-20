import { describe, expect, it } from 'vitest';
import { extractThread } from '@/lib/threads';

const page = (html: string, head = '') => new DOMParser().parseFromString(`<html><head>${head}</head><body>${html}</body></html>`, 'text/html');

const hnComment = (indent: number, user: string, text: string) =>
  `<tr class="athing comtr"><td><table><tr><td class="ind" indent="${indent}"></td><td class="default">` +
  `<span class="comhead"><a class="hnuser">${user}</a></span><div class="comment"><div class="commtext c00">${text}</div>` +
  `<div class="reply"><a>reply</a></div></div></td></tr></table></td></tr>`;

describe('extractThread', () => {
  it('reads a Hacker News item: the story, its link, and the comments by depth', () => {
    const doc = page(
      `<table class="fatitem"><tr class="athing"><td><span class="titleline"><a href="https://reuters.com/x">Anthropic's Nasdaq debut</a></span></td></tr>` +
        `<tr><td><span class="score">812 points</span> by <a class="hnuser">dang</a></td></tr></table>` +
        `<table>${hnComment(0, 'alice', '<p>Big moment.</p><p>Second paragraph.</p>')}${hnComment(1, 'bob', 'I disagree.')}</table>`,
    );
    const a = extractThread(doc, 'https://news.ycombinator.com/item?id=1')!;
    expect(a.format).toBe('thread');
    expect(a.title).toBe("Anthropic's Nasdaq debut");
    expect(a.text).toBe(
      [
        "Post by dang (812 points): Anthropic's Nasdaq debut",
        'Link: https://reuters.com/x',
        '',
        'Comments (2, indented by reply depth):',
        '- alice: Big moment. / Second paragraph.',
        '  - bob: I disagree.',
      ].join('\n'),
    );
  });

  it('reads a Reddit thread from its post and comment elements', () => {
    const comment = (depth: number, author: string, score: number, text: string, inner = '') =>
      `<shreddit-comment author="${author}" depth="${depth}" score="${score}"><div slot="comment"><p>${text}</p></div>${inner}</shreddit-comment>`;
    const doc = page(
      `<shreddit-post post-title="ELI5: Why is the sky blue?" author="curious" score="5400"><div slot="text-body"><p>I never understood it.</p></div></shreddit-post>` +
        comment(0, 'physicist', 3200, 'Rayleigh scattering.', comment(1, 'student', 40, 'Why not violet?')),
    );
    const a = extractThread(doc, 'https://www.reddit.com/r/explainlikeimfive/comments/abc/x/')!;
    expect(a.text).toBe(
      [
        'Post by curious (5400 points): ELI5: Why is the sky blue?',
        'I never understood it.',
        '',
        'Comments (2, indented by reply depth):',
        '- physicist (3200 points): Rayleigh scattering.',
        '  - student (40 points): Why not violet?',
      ].join('\n'),
    );
  });

  it('reads an old Reddit thread', () => {
    const doc = page(
      `<div class="thing link" data-author="op"><a class="title">Old title</a><div class="expando"><div class="md"><p>Body</p></div></div></div>` +
        `<div class="thing comment" data-author="a"><div class="entry"><span class="score unvoted">12 points</span><div class="md"><p>Top</p></div></div>` +
        `<div class="child"><div class="thing comment" data-author="b"><div class="entry"><div class="md"><p>Reply</p></div></div></div></div></div>`,
    );
    const a = extractThread(doc, 'https://old.reddit.com/r/x/comments/1/y/')!;
    expect(a.text).toContain('- a (12 points): Top');
    expect(a.text).toContain('  - b: Reply');
  });

  it('reads a Lobsters story', () => {
    const doc = page(
      `<div class="story"><a class="u-url">Codeberg's domain disappeared</a><div class="byline"><a href="/~poster">poster</a></div></div>` +
        `<ol class="comments_subtree"><li><div class="comment" id="c_1"><a class="upvoter">97</a><div class="byline"><a href="/~krig"><img></a><a href="/~krig">krig</a></div><div class="comment_text"><p>Ouch.</p></div></div>` +
        `<ol class="comments_subtree"><li><div class="comment" id="c_2"><div class="byline"><a href="/~x">x</a></div><div class="comment_text">Indeed.</div></div></li></ol></li></ol>`,
    );
    const a = extractThread(doc, 'https://lobste.rs/s/spmgsd/x')!;
    expect(a.title).toBe("Codeberg's domain disappeared");
    expect(a.text).toContain('- krig (97 points): Ouch.');
    expect(a.text).toContain('  - x: Indeed.');
  });

  it('reads a Discourse topic', () => {
    const post = (user: string, text: string) => `<article class="topic-post"><div class="names"><span class="first username"><a>${user}</a></span></div><div class="cooked"><p>${text}</p></div></article>`;
    const doc = page(
      `<h1><a class="fancy-title">AI content labelling</a></h1>${post('martin', 'We are adding labels.')}${post('sam', 'Great idea.')}`,
      '<meta name="generator" content="Discourse 2026.11.0">',
    );
    const a = extractThread(doc, 'https://meta.discourse.org/t/x/1')!;
    expect(a.text).toContain('Post by martin: AI content labelling');
    expect(a.text).toContain('- sam: Great idea.');
  });

  it('is null for pages that are not threads', () => {
    expect(extractThread(page('<article><p>Just an article.</p></article>'), 'https://e.com/a')).toBeNull();
    expect(extractThread(page('<p>Front page</p>'), 'https://news.ycombinator.com/')).toBeNull();
  });
});
