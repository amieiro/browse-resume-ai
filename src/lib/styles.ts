import type { Settings } from './settings';

// Summary styles: an extra instruction for the model ("simple words", "only the figures"). The
// built-in ones have translated names in the interface; their instructions are always in English,
// like the rest of the prompt. Users add their own in the settings.

export interface CustomStyle {
  id: string;
  name: string;
  instruction: string;
}

export const STANDARD_STYLE = 'standard';

/** Built-in styles, in the order the selectors show them; the name is the i18n key style_<id>. */
export const PRESET_STYLES: { id: string; instruction: string }[] = [
  { id: STANDARD_STYLE, instruction: '' },
  { id: 'simple', instruction: 'Use simple words and short sentences, as for a ten-year-old, and explain any technical term.' },
  { id: 'numbers', instruction: 'Focus on the figures, data, dates and amounts in the text; keep everything else to a minimum.' },
  { id: 'formal', instruction: 'Write in a formal, neutral register, suitable for a report.' },
  {
    id: 'critical',
    instruction: 'After the summary, add a short critical note: weak points, missing evidence or one-sided claims in the text.',
  },
];

/** Longest instruction a custom style may have. */
export const MAX_STYLE_INSTRUCTION = 500;

/** The instruction of the selected style; empty for the standard one or an unknown id. */
export function styleInstruction(settings: Pick<Settings, 'style' | 'customStyles'>): string {
  const preset = PRESET_STYLES.find((s) => s.id === settings.style);
  if (preset) return preset.instruction;
  return settings.customStyles.find((s) => s.id === settings.style)?.instruction.trim().slice(0, MAX_STYLE_INSTRUCTION) ?? '';
}

/** Whether a style id exists (built in, or among the custom ones). */
export function isKnownStyle(id: string, customStyles: CustomStyle[]): boolean {
  return PRESET_STYLES.some((s) => s.id === id) || customStyles.some((s) => s.id === id);
}

/**
 * The styles for a selector: built-in names through `t`, then the custom ones by their own name.
 */
export function styleOptions(customStyles: CustomStyle[], t: (key: string) => string): { value: string; label: string }[] {
  return [
    ...PRESET_STYLES.map((s) => ({ value: s.id, label: t(`style_${s.id}`) })),
    ...customStyles.filter((s) => s.name.trim()).map((s) => ({ value: s.id, label: s.name.trim() })),
  ];
}

/** A short, stable fingerprint of a style instruction, for the cache key. */
export function styleKey(settings: Pick<Settings, 'style' | 'customStyles'>): string {
  const instruction = styleInstruction(settings);
  if (!instruction) return STANDARD_STYLE;
  let hash = 5381;
  for (let i = 0; i < instruction.length; i++) hash = ((hash << 5) + hash + instruction.charCodeAt(i)) | 0;
  return `${settings.style}:${(hash >>> 0).toString(36)}`;
}
