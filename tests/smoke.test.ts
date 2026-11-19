import { describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';

describe('test environment', () => {
  it('provides a fake browser storage', () => {
    expect(fakeBrowser.storage.local).toBeDefined();
  });
});
