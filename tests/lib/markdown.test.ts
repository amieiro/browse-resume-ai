import { describe, expect, it } from 'vitest';
import { renderMarkdown } from '@/lib/markdown';

function render(source: string): HTMLElement {
  const el = document.createElement('div');
  renderMarkdown(source, el);
  return el;
}

describe('renderMarkdown', () => {
  it('renders blank-line separated paragraphs', () => {
    const el = render('One.\n\nTwo.');
    expect([...el.querySelectorAll('p')].map((p) => p.textContent)).toEqual(['One.', 'Two.']);
  });

  it('renders dash lines as one list', () => {
    const el = render('- a\n- b');
    expect(el.querySelectorAll('ul').length).toBe(1);
    expect([...el.querySelectorAll('li')].map((li) => li.textContent)).toEqual(['a', 'b']);
  });

  it('renders asterisk bullets too', () => {
    expect(render('* a\n* b').querySelectorAll('li').length).toBe(2);
  });

  it('renders a paragraph followed by a list', () => {
    const el = render('Intro\n- a');
    expect(el.children[0]!.tagName).toBe('P');
    expect(el.children[1]!.tagName).toBe('UL');
  });

  it('renders **bold**', () => {
    const strong = render('a **b** c').querySelector('p strong');
    expect(strong?.textContent).toBe('b');
  });

  it('keeps an unclosed ** as literal text', () => {
    const el = render('a **unclosed');
    expect(el.querySelector('strong')).toBeNull();
    expect(el.textContent).toBe('a **unclosed');
  });

  it('never creates elements from HTML in the source', () => {
    const el = render('<img src=x onerror=alert(1)>');
    expect(el.querySelector('img')).toBeNull();
    expect(el.textContent).toContain('<img');
  });

  it('never creates links', () => {
    expect(render('[x](javascript:alert(1))').querySelector('a')).toBeNull();
  });

  it('replaces the previous content', () => {
    const el = document.createElement('div');
    renderMarkdown('first', el);
    renderMarkdown('second', el);
    expect(el.textContent).toBe('second');
  });

  it('renders # headings as h2 and deeper ones as h3, without the hashes', () => {
    const el = render('# Top\n\n## Key points\n- a\n\n### Details\ntext');
    expect([...el.querySelectorAll('h2')].map((h) => h.textContent)).toEqual(['Top', 'Key points']);
    expect(el.querySelector('h3')?.textContent).toBe('Details');
    expect(el.textContent).not.toContain('#');
  });

  it('ends a list at a heading', () => {
    const el = render('- a\n## Next\n- b');
    expect(el.querySelectorAll('ul').length).toBe(2);
  });

  it('renders numbered lines as an ordered list', () => {
    const el = render('1. one\n2. two');
    expect(el.querySelectorAll('ol li').length).toBe(2);
    expect(el.querySelector('ol li')?.textContent).toBe('one');
  });

  it('renders `code` and keeps ** inside it literal', () => {
    const code = render('set `a**b` now').querySelector('p code');
    expect(code?.textContent).toBe('a**b');
  });

  it('renders *italic* and _italic_', () => {
    const el = render('an *important* and _key_ word');
    expect([...el.querySelectorAll('em')].map((e) => e.textContent)).toEqual(['important', 'key']);
  });

  it('keeps snake_case names and lone asterisks literal', () => {
    const el = render('session_upload_progress costs 2 * 3');
    expect(el.querySelector('em')).toBeNull();
    expect(el.textContent).toBe('session_upload_progress costs 2 * 3');
  });

  it('renders bold and italic inside list items and headings', () => {
    const el = render('- **Lead:** an *early* result');
    expect(el.querySelector('li strong')?.textContent).toBe('Lead:');
    expect(el.querySelector('li em')?.textContent).toBe('early');
  });

  it('drops horizontal rules', () => {
    expect(render('a\n\n---\n\nb').textContent).toBe('ab');
  });
});
