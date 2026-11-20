import { exportSummary, type ExportActions, type ExportInput, type ExportKind } from '@/lib/export';
import { t } from '@/lib/i18n';

const KINDS: { kind: ExportKind; label: string }[] = [
  { kind: 'markdown', label: 'ui_export_markdown' },
  { kind: 'download', label: 'ui_export_download' },
  { kind: 'obsidian', label: 'ui_export_obsidian' },
];

/** An Export button with a small menu: copy as Markdown, download a .md file, open in Obsidian. */
export function exportMenu(getInput: () => ExportInput | null, actions: ExportActions) {
  const toggle = Object.assign(document.createElement('button'), { type: 'button', name: 'export', textContent: `${t('ui_export')} ▾` });
  toggle.setAttribute('aria-haspopup', 'menu');
  toggle.setAttribute('aria-expanded', 'false');
  const menu = Object.assign(document.createElement('div'), { className: 'export-menu', hidden: true });
  menu.setAttribute('role', 'menu');
  const wrapper = Object.assign(document.createElement('div'), { className: 'export' });
  wrapper.append(toggle, menu);

  const setOpen = (open: boolean) => {
    menu.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
  };
  let resetTimer: ReturnType<typeof setTimeout> | undefined;
  const flash = (text: string) => {
    toggle.textContent = text;
    clearTimeout(resetTimer);
    resetTimer = setTimeout(() => (toggle.textContent = `${t('ui_export')} ▾`), 1500);
  };

  menu.append(
    ...KINDS.map(({ kind, label }) => {
      const item = Object.assign(document.createElement('button'), { type: 'button', name: `export-${kind}`, textContent: t(label) });
      item.setAttribute('role', 'menuitem');
      item.addEventListener('click', () => {
        setOpen(false);
        const input = getInput();
        if (!input) return;
        void exportSummary(kind, input, actions).then(
          () => {
            if (kind === 'markdown') flash(t('ui_copied'));
          },
          () => {},
        );
      });
      return item;
    }),
  );

  toggle.addEventListener('click', () => setOpen(menu.hidden));
  wrapper.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !menu.hidden) {
      setOpen(false);
      toggle.focus();
    }
  });
  wrapper.addEventListener('focusout', (event) => {
    if (!wrapper.contains(event.relatedTarget as Node | null)) setOpen(false);
  });

  return {
    element: wrapper,
    setDisabled(disabled: boolean) {
      toggle.disabled = disabled;
      if (disabled) setOpen(false);
    },
  };
}
