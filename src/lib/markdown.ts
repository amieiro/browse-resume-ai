// Renders the small Markdown subset the prompt asks for (paragraphs, "-"/"*" bullets, **bold**)
// using DOM nodes and textContent only. Model output never reaches innerHTML.

const BULLET = /^\s*[-*]\s+/;

function appendInline(parent: HTMLElement, text: string): void {
  const parts = text.split('**');
  // An odd number of parts means every ** has a partner; otherwise the last one stays literal.
  const closedPairs = parts.length % 2 === 1 ? parts.length : parts.length - 1;
  parts.forEach((part, i) => {
    if (i >= closedPairs) {
      parent.append(`**${part}`);
    } else if (i % 2 === 1) {
      const strong = document.createElement('strong');
      strong.textContent = part;
      parent.append(strong);
    } else if (part) {
      parent.append(part);
    }
  });
}

export function renderMarkdown(source: string, container: HTMLElement): void {
  container.replaceChildren();
  let paragraph: string[] = [];
  let list: HTMLUListElement | null = null;

  const flushParagraph = () => {
    if (paragraph.length === 0) return;
    const p = document.createElement('p');
    appendInline(p, paragraph.join(' '));
    container.append(p);
    paragraph = [];
  };

  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (BULLET.test(rawLine)) {
      flushParagraph();
      if (!list) {
        list = document.createElement('ul');
        container.append(list);
      }
      const li = document.createElement('li');
      appendInline(li, rawLine.replace(BULLET, '').trim());
      list.append(li);
    } else if (line === '') {
      flushParagraph();
      list = null;
    } else {
      list = null;
      paragraph.push(line);
    }
  }
  flushParagraph();
}
