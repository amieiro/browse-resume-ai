import { describe, expect, it } from 'vitest';
import { defaultSettings } from '@/lib/settings';
import { isKnownStyle, PRESET_STYLES, styleInstruction, styleOptions } from '@/lib/styles';

const custom = [{ id: 'c1', name: ' Tweet ', instruction: 'Write it as a tweet.' }, { id: 'c2', name: '', instruction: 'x' }];

describe('styles', () => {
  it('has no instruction for the standard style', () => {
    expect(styleInstruction(defaultSettings('en'))).toBe('');
  });

  it('gives the instruction of a built-in or a custom style', () => {
    expect(styleInstruction({ style: 'simple', customStyles: [] })).toContain('simple words');
    expect(styleInstruction({ style: 'c1', customStyles: custom })).toBe('Write it as a tweet.');
    expect(styleInstruction({ style: 'gone', customStyles: custom })).toBe('');
  });

  it('lists the built-in styles by their translated name, then the named custom ones', () => {
    const options = styleOptions(custom, (key) => `[${key}]`);
    expect(options.map((o) => o.label)).toEqual([...PRESET_STYLES.map((s) => `[style_${s.id}]`), 'Tweet']);
    expect(options.at(-1)!.value).toBe('c1');
  });

  it('knows which ids exist', () => {
    expect(isKnownStyle('formal', [])).toBe(true);
    expect(isKnownStyle('c1', custom)).toBe(true);
    expect(isKnownStyle('c9', custom)).toBe(false);
  });
});
