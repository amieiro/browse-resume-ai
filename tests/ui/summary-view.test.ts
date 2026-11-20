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
  handlers = { onRegenerate: vi.fn(), onSettingsChange: vi.fn(), onOpenOptions: vi.fn() };
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
    expect(handlers.onSettingsChange).toHaveBeenCalledWith({ models: { claude: 'opus', codex: 'gpt-6.2-sol' } });
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
});

