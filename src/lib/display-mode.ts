import { browser } from 'wxt/browser';
import type { DisplayMode } from './settings';

/** Popup mode sets the action popup; side panel mode clears it so action.onClicked fires. */
export async function applyDisplayMode(mode: DisplayMode): Promise<void> {
  await browser.action.setPopup({ popup: mode === 'popup' ? 'summary-popup.html' : '' });
}
