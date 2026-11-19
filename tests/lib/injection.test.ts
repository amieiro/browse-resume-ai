import { describe, expect, it } from 'vitest';
import { classifyInjectionError } from '@/lib/injection';

describe('classifyInjectionError', () => {
  it.each([
    'Cannot access a chrome:// URL',
    'Cannot access a chrome-extension:// URL of different extension',
    'The extensions gallery cannot be scripted.',
    'Frame with ID 0 is showing error page',
    'No tab with id: 5.',
  ])('treats %j as an unreadable page', (message) => {
    expect(classifyInjectionError(message)).toBe('page_unreadable');
  });

  it('asks for a new click when the activeTab grant is gone', () => {
    expect(
      classifyInjectionError(
        'Cannot access contents of the page. Extension manifest must request permission to access the respective host.',
      ),
    ).toBe('needs_click');
  });
});
