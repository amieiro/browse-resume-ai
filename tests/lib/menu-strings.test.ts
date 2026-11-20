import { describe, expect, it } from 'vitest';
import { menuTitles } from '@/lib/menu-strings';

describe('menuTitles', () => {
  it('uses the interface language setting', () => {
    expect(menuTitles('gl-ES', 'en-US')).toEqual({ selection: 'Resumir a selección', page: 'Resumir a páxina' });
  });

  it('follows the browser language on auto', () => {
    expect(menuTitles('auto', 'gl')).toEqual({ selection: 'Resumir a selección', page: 'Resumir a páxina' });
  });

  it('falls back to English for an unknown language', () => {
    expect(menuTitles('auto', 'xx')).toEqual({ selection: 'Summarize the selection', page: 'Summarize the page' });
  });
});
