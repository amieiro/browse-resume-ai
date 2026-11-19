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
});
