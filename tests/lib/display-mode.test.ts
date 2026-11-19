import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { applyDisplayMode } from '@/lib/display-mode';

// The fake browser does not implement action.setPopup; record the calls instead.
let setPopup: ReturnType<typeof vi.fn>;

describe('applyDisplayMode', () => {
  beforeEach(() => {
    fakeBrowser.reset();
    setPopup = vi.fn(async () => {});
    (fakeBrowser.action as any).setPopup = setPopup;
  });

  it('sets the popup in popup mode', async () => {
    await applyDisplayMode('popup');
    expect(setPopup).toHaveBeenLastCalledWith({ popup: 'popup.html' });
  });

  it('clears the popup in side panel mode', async () => {
    await applyDisplayMode('sidepanel');
    expect(setPopup).toHaveBeenLastCalledWith({ popup: '' });
  });
});
