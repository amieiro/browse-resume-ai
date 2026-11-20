// Renders the small Markdown subset models write in summaries (paragraphs, "-"/"*" bullets,
// numbered lists, # headings, **bold**, *italic*/_italic_, `code`) using DOM nodes and
// textContent only. Model output never reaches innerHTML, and links and images are never created.

const BULLET = /^\s*[-*+]\s+/;
const NUMBERED = /^\s*\d+[.)]\s+/;
const HEADING = /^\s*(#{1,6})\s+(.*?)\s*#*\s*$/;
const RULE = /^\s*([-*_])(\s*\1){2,}\s*$/;

// Inline spans, in order of precedence: code first (nothing is parsed inside it), then bold, then
// italic. Italic needs a non-space next to each marker, and "_" also needs no word character
// outside it, so snake_case names and "2 * 3" stay literal.
const INLINE = /`([^`]+)`|\*\*(?=\S)(.+?)(?<=\S)\*\*|\*(?=[^\s*])(.+?)(?<=[^\s*])\*|(?<![\p{L}\p{N}_])_(?=\S)(.+?)(?<=\S)_(?![\p{L}\p{N}_])/u;

function appendInline(parent: HTMLElement, text: string): void {
  let rest = text;
  while (rest) {
    const match = INLINE.exec(rest);
    if (!match) {
      parent.append(rest);
      return;
    }
    if (match.index > 0) parent.append(rest.slice(0, match.index));
    const [, code, bold, starItalic, underscoreItalic] = match;
    if (code !== undefined) {
      const el = document.createElement('code');
      el.textContent = code;
      parent.append(el);
    } else if (bold !== undefined) {
      const el = document.createElement('strong');
      appendInline(el, bold);
      parent.append(el);
    } else {
      const el = document.createElement('em');
      appendInline(el, (starItalic ?? underscoreItalic)!);
      parent.append(el);
    }
    rest = rest.slice(match.index + match[0].length);
  }
}

export function renderMarkdown(source: string, container: HTMLElement): void {
  container.replaceChildren();
  let paragraph: string[] = [];
  let list: HTMLUListElement | HTMLOListElement | null = null;

  const flushParagraph = () => {
    if (paragraph.length === 0) return;
    const p = document.createElement('p');
    appendInline(p, paragraph.join(' '));
    container.append(p);
    paragraph = [];
  };

  const addItem = (tag: 'ul' | 'ol', text: string) => {
    flushParagraph();
    if (!list || list.tagName.toLowerCase() !== tag) {
      list = document.createElement(tag);
      container.append(list);
    }
    const li = document.createElement('li');
    appendInline(li, text.trim());
    list.append(li);
  };

  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim();
    const heading = HEADING.exec(rawLine);
    if (RULE.test(rawLine)) {
      flushParagraph();
      list = null;
    } else if (heading) {
      flushParagraph();
      list = null;
      const h = document.createElement(heading[1]!.length <= 2 ? 'h2' : 'h3');
      appendInline(h, heading[2]!);
      container.append(h);
    } else if (BULLET.test(rawLine)) {
      addItem('ul', rawLine.replace(BULLET, ''));
    } else if (NUMBERED.test(rawLine)) {
      addItem('ol', rawLine.replace(NUMBERED, ''));
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
