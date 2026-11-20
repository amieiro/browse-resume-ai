import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { setMessages } from '@/lib/i18n';
import { defaultSettings } from '@/lib/settings';
import { mountSummaryView, type SummaryViewHandlers } from '@/ui/summary-view';

let root: HTMLElement;
let handlers: { [K in keyof SummaryViewHandlers]: ReturnType<typeof vi.fn> };

function mount() {
  return mountSummaryView(root, defaultSettings('en'), handlers as unknown as SummaryViewHandlers);
}

const select = (name: string) => root.querySelector<HTMLSelectElement>(`select[name="${name}"]`)!;
const button = (name: string) => root.querySelector<HTMLButtonElement>(`button[name="${name}"]`)!;
const change = (el: HTMLSelectElement, value: string) => {
  el.value = value;
  el.dispatchEvent(new Event('change'));
};

beforeEach(() => {
  fakeBrowser.reset();
  // Show the message key so tests can see which message is shown.
  setMessages(new Proxy({}, { get: (_t, key) => `[${String(key)}]` }));
  root = document.createElement('div');
  handlers = { onRegenerate: vi.fn(), onSettingsChange: vi.fn(), onOpenOptions: vi.fn(), onAsk: vi.fn(), onOpenHistory: vi.fn() };
});

describe('summary view selectors', () => {
  it('shows the current settings', () => {
    mount();
    expect(select('provider').value).toBe('claude');
    expect(select('model').value).toBe('sonnet');
    expect([...select('model').options].map((o) => o.value)).toEqual(['sonnet', 'opus', 'haiku', 'fable']);
    expect(select('length').value).toBe('medium');
    expect(select('language').value).toBe('en-US');
    expect(select('language').options.length).toBe(201);
  });

  it('changing provider repopulates the models and saves', () => {
    mount();
    change(select('provider'), 'codex');
    expect(select('model').value).toBe('gpt-6.2-sol');
    expect(handlers.onSettingsChange).toHaveBeenCalledWith({ provider: 'codex' });
  });

  it('changing the model saves it for the current provider', () => {
    mount();
    change(select('model'), 'opus');
    expect(handlers.onSettingsChange).toHaveBeenCalledWith({ models: { claude: 'opus', codex: 'gpt-6.2-sol', ollama: '' } });
  });

  it('changing length saves without regenerating', () => {
    mount();
    change(select('length'), 'long');
    expect(handlers.onSettingsChange).toHaveBeenCalledWith({ length: 'long' });
    expect(handlers.onRegenerate).not.toHaveBeenCalled();
  });

  it('changing language saves it', () => {
    mount();
    change(select('language'), 'gl-ES');
    expect(handlers.onSettingsChange).toHaveBeenCalledWith({ language: 'gl-ES' });
  });

  it('setSettings updates the selectors', () => {
    const view = mount();
    view.setSettings({ ...defaultSettings('en'), length: 'short' });
    expect(select('length').value).toBe('short');
  });

  it('the settings button opens the options', () => {
    mount();
    button('options').click();
    expect(handlers.onOpenOptions).toHaveBeenCalled();
  });
});

describe('summary view states', () => {
  it('idle shows the click hint', () => {
    mount().setState({ status: 'idle' });
    expect(root.textContent).toContain('[ui_idle_hint]');
  });

  it('running without text shows progress; Copy is disabled', () => {
    mount().setState({ status: 'running', title: 'Title', text: '', truncated: false });
    expect(root.querySelector('[data-role="progress"]')?.hasAttribute('hidden')).toBe(false);
    expect(root.textContent).toContain('Title');
    expect(button('copy').disabled).toBe(true);
  });

  it('running with text renders it', () => {
    mount().setState({ status: 'running', title: 'T', text: '**Bold** text', truncated: false });
    expect(root.querySelector('[data-role="summary"] strong')?.textContent).toBe('Bold');
    expect(button('copy').disabled).toBe(true);
  });

  it('done enables Copy and hides progress', () => {
    mount().setState({ status: 'done', title: 'T', text: 'Text', truncated: false });
    expect(button('copy').disabled).toBe(false);
    expect(root.querySelector('[data-role="progress"]')?.hasAttribute('hidden')).toBe(true);
  });

  it('done and truncated shows the notice', () => {
    mount().setState({ status: 'done', title: 'T', text: 'Text', truncated: true });
    expect(root.textContent).toContain('[ui_truncated]');
  });

  it('an error shows its message, keeps partial text and offers to try again', () => {
    mount().setState({ status: 'error', code: 'host_missing', title: 'T', text: 'Partial', truncated: false });
    expect(root.textContent).toContain('[error_host_missing]');
    expect(root.textContent).toContain('Partial');
    expect(button('regenerate').textContent).toBe('[ui_try_again]');
  });

  it('an error shows the provider detail when there is one', () => {
    mount().setState({ status: 'error', code: 'usage_limit', title: 'T', text: '', truncated: false, detail: 'resets 3pm' });
    expect(root.querySelector('[data-role="detail"]')?.textContent).toBe('resets 3pm');
  });

  it('needs_click hides Summarize again', () => {
    mount().setState({ status: 'error', code: 'needs_click', title: '', text: '', truncated: false });
    expect(root.textContent).toContain('[error_needs_click]');
    expect(button('regenerate').hidden).toBe(true);
  });

  it('Summarize again calls onRegenerate', () => {
    mount().setState({ status: 'done', title: 'T', text: 'Text', truncated: false });
    expect(button('regenerate').textContent).toBe('[ui_regenerate]');
    button('regenerate').click();
    expect(handlers.onRegenerate).toHaveBeenCalled();
  });

  it('Copy writes the summary text to the clipboard', async () => {
    const writeText = vi.fn(async () => {});
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    mount().setState({ status: 'done', title: 'T', text: '- a\n- b', truncated: false });
    button('copy').click();
    expect(writeText).toHaveBeenCalledWith('- a\n- b');
  });

  it('Copy works on the partial text left by an error', async () => {
    const writeText = vi.fn(async () => {});
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    mount().setState({ status: 'error', code: 'provider_failed', title: 'T', text: 'Partial', truncated: false });
    expect(button('copy').disabled).toBe(false);
    button('copy').click();
    expect(writeText).toHaveBeenCalledWith('Partial');
  });

  it('Copy stays disabled on an error without text', () => {
    mount().setState({ status: 'error', code: 'host_missing', title: '', text: '', truncated: false });
    expect(button('copy').disabled).toBe(true);
  });

  it('marks a summary of selected text', () => {
    const view = mount();
    view.setState({ status: 'done', title: 'T', text: 'Text', truncated: false, source: 'selection' });
    expect(root.querySelector('[data-role="source"]')?.hasAttribute('hidden')).toBe(false);
    expect(root.querySelector('[data-role="source"]')?.textContent).toBe('[ui_selection]');
    view.setState({ status: 'done', title: 'T', text: 'Text', truncated: false });
    expect(root.querySelector('[data-role="source"]')?.hasAttribute('hidden')).toBe(true);
  });

  describe('questions', () => {
    const form = () => root.querySelector<HTMLFormElement>('form.ask')!;
    const input = () => root.querySelector<HTMLInputElement>('input[name="question"]')!;
    const done = { status: 'done' as const, title: 'T', text: 'Summary', truncated: false };

    it('offers a question field under a finished summary only', () => {
      const view = mount();
      view.setState({ status: 'running', title: 'T', text: 'Sum', truncated: false });
      expect(form().hidden).toBe(true);
      view.setState(done);
      expect(form().hidden).toBe(false);
      expect(input().placeholder).toBe('[ui_ask_placeholder]');
      expect(button('ask').textContent).toBe('[ui_ask]');
    });

    it('sends the question and clears the field', () => {
      mount().setState(done);
      input().value = 'Who?';
      form().dispatchEvent(new Event('submit', { cancelable: true }));
      expect(handlers.onAsk).toHaveBeenCalledWith('Who?');
      expect(input().value).toBe('');
    });

    it('does not send an empty question', () => {
      mount().setState(done);
      input().value = '   ';
      form().dispatchEvent(new Event('submit', { cancelable: true }));
      expect(handlers.onAsk).not.toHaveBeenCalled();
    });

    it('shows each question with its answer as Markdown, and waits while one is answered', () => {
      mount().setState({
        ...done,
        qa: [
          { question: 'First?', answer: '**Yes**', status: 'done' },
          { question: 'Second?', answer: '', status: 'running' },
        ],
      });
      const items = root.querySelectorAll('.qa-item');
      expect(items).toHaveLength(2);
      expect(items[0]!.querySelector('.question')?.textContent).toBe('First?');
      expect(items[0]!.querySelector('.answer strong')?.textContent).toBe('Yes');
      expect(items[1]!.querySelector('.progress')).not.toBeNull();
      expect(input().disabled).toBe(true);
      expect(button('ask').disabled).toBe(true);
    });

    it('shows the error of a failed answer', () => {
      mount().setState({ ...done, qa: [{ question: 'Q?', answer: '', status: 'error', code: 'usage_limit' }] });
      expect(root.querySelector('.qa-item .error')?.textContent).toContain('[error_usage_limit]');
    });
  });

  it('shows a model by its name when the catalog has one, keeping the id as the value', () => {
    mountSummaryView(root, { ...defaultSettings('en'), modelLabels: { claude: { sonnet: 'Sonnet 5.5' } } }, handlers as unknown as SummaryViewHandlers);
    const option = [...select('model').options].find((o) => o.value === 'sonnet')!;
    expect(option.textContent).toBe('Sonnet 5.5');
    expect([...select('model').options].find((o) => o.value === 'opus')!.textContent).toBe('opus');
  });

  it('opens the history', () => {
    mount();
    button('history').click();
    expect(handlers.onOpenHistory).toHaveBeenCalled();
  });

  it('offers the styles, built in and custom, and saves the chosen one', () => {
    const settings = { ...defaultSettings('en'), customStyles: [{ id: 'c1', name: 'Tweet', instruction: 'As a tweet.' }] };
    mountSummaryView(root, settings, handlers as unknown as SummaryViewHandlers);
    const options = [...select('style').options].map((o) => o.textContent);
    expect(options[0]).toBe('[style_standard]');
    expect(options.at(-1)).toBe('Tweet');
    change(select('style'), 'c1');
    expect(handlers.onSettingsChange).toHaveBeenCalledWith({ style: 'c1' });
  });
});

describe('summary view export', () => {
  const exportActions = () => ({ copy: vi.fn(async (_text: string) => {}), download: vi.fn(), open: vi.fn() });

  it('is enabled only for a finished summary', () => {
    const view = mount();
    expect(button('export').disabled).toBe(true);
    view.setState({ status: 'running', title: 'T', text: 'Part', truncated: false });
    expect(button('export').disabled).toBe(true);
    view.setState({ status: 'error', code: 'provider_failed', title: 'T', text: 'Part', truncated: false });
    expect(button('export').disabled).toBe(true);
    view.setState({ status: 'done', title: 'T', text: 'Text', truncated: false });
    expect(button('export').disabled).toBe(false);
  });

  it('opens a menu and copies the summary as Markdown with its title, link and answers', async () => {
    const actions = exportActions();
    handlers.exportActions = actions as never;
    const view = mount();
    view.setState({
      status: 'done', title: 'Page', url: 'https://e.com/p', text: '- a', truncated: false,
      qa: [{ question: 'Q?', answer: 'A.', status: 'done' }],
    });
    const menu = root.querySelector<HTMLElement>('.export-menu')!;
    expect(menu.hidden).toBe(true);
    button('export').click();
    expect(menu.hidden).toBe(false);
    button('export-markdown').click();
    expect(menu.hidden).toBe(true);
    await vi.waitFor(() => expect(actions.copy).toHaveBeenCalledWith('# Page\n\n<https://e.com/p>\n\n- a\n\n### Q?\n\nA.\n'));
    await vi.waitFor(() => expect(button('export').textContent).toBe('[ui_copied]'));
  });

  it('sends the note to Obsidian through the clipboard', async () => {
    const actions = exportActions();
    handlers.exportActions = actions as never;
    mount().setState({ status: 'done', title: 'Page', url: 'https://e.com/p', text: 'x', truncated: false });
    button('export').click();
    button('export-obsidian').click();
    await vi.waitFor(() => expect(actions.open).toHaveBeenCalledWith('obsidian://new?name=Page&clipboard'));
    expect(actions.copy.mock.calls[0]![0]).toMatch(/^---\ntitle: "Page"\nsource: "https:\/\/e.com\/p"\n/);
  });

  it('closes the menu with Escape', () => {
    mount().setState({ status: 'done', title: 'Page', text: 'x', truncated: false });
    button('export').click();
    root.querySelector('.export')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(root.querySelector<HTMLElement>('.export-menu')!.hidden).toBe(true);
  });
});

describe('summary view usage', () => {
  const usageLine = () => root.querySelector<HTMLElement>('[data-role="usage"]')!;

  it('shows what a finished summary took', () => {
    const view = mount();
    view.setState({ status: 'running', title: 'T', text: 'x', truncated: false });
    expect(usageLine().hidden).toBe(true);
    view.setState({ status: 'done', title: 'T', text: 'x', truncated: false, usage: { ms: 1500, inputTokens: 10, outputTokens: 2 } });
    expect(usageLine().hidden).toBe(false);
    expect(usageLine().textContent).toBe('[ui_usage_tokens] · [ui_usage_time]');
  });

  it('says when the summary came from the cache', () => {
    mount().setState({ status: 'done', title: 'T', text: 'x', truncated: false, cached: true });
    expect(usageLine().textContent).toBe('[ui_usage_cached]');
  });

  it('shows nothing for a summary without usage', () => {
    mount().setState({ status: 'done', title: 'T', text: 'x', truncated: false });
    expect(usageLine().hidden).toBe(true);
  });
});

