import { fileURLToPath } from 'node:url';
import { defineConfig } from 'wxt';

// Public key that pins the Chrome extension ID to pdokiakaaeffjlabmofdppjakdhaimpi.
// The private key lives outside the repository.
const EXTENSION_KEY =
  'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAoyhv1ZGLtMPsHoX+0omlJFxLrKKM7Ea34Wy3bOT8Xn6CPvGNRNDnHVUo/0vxGwYoYvinJOpsBm8MwMljaTGh7ySxx8pP5u45dXYqEwHxUUY6s01rQtd7ctFJD5mVU/z9uwZe0CxEp+aTWty+d0vaXrr+vzg+MP0LFTCHI6KPxD9JECRnBs0XeVkTeUpxSsumNX+d0ASUm/dHYOsct1smjfMJ0CZ56AxJm53HpKEzOrBk9pAmYWHBXTLHsw4wnU7JAxjO648B6sgHyeBzIVTZNcXTSC/EIOuPR42peNcxfl6UlYnKck3OTbXI/fhc6BagTXAYjMhF8+dEVng6UOFixQIDAQAB';

/** The Firefox add-on ID; the native host's Firefox manifest allows only this one. */
export const FIREFOX_ID = 'browse-resume-ai@amieiro.github.io';

/**
 * BRA_E2E=1 builds the end-to-end test variant: WebDriver cannot open extension pages in Firefox,
 * nor click the toolbar icon, so this build opens its settings page itself and may read any page.
 * Never shipped (dist is built without it).
 */
const E2E = process.env.BRA_E2E === '1';

export default defineConfig({
  ...(E2E ? { outDirTemplate: '{{browser}}-mv{{manifestVersion}}-e2e', vite: () => ({ define: { 'import.meta.env.BRA_E2E': 'true' } }) } : {}),
  srcDir: 'src',
  publicDir: 'public',
  // Firefox too (WXT builds Firefox as MV2 by default).
  manifestVersion: 3,
  hooks: {
    // pdf.js parses in a Web Worker loaded from this file. Copied as it is: bundled into Firefox's
    // single-file background page, an imported URL would become a data: URL, which cannot start one.
    'build:publicAssets': (_wxt, files) => {
      files.push({
        absoluteSrc: fileURLToPath(new URL('./node_modules/pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url)),
        relativeDest: 'pdf.worker.min.mjs',
      });
    },
  },
  manifest: ({ browser }) => {
    const firefox = browser === 'firefox';
    return {
      name: '__MSG_extName__',
      description: '__MSG_extDescription__',
      default_locale: 'en',
      // Firefox has no side panel API (WXT turns the side panel page into a sidebar_action) and no
      // offscreen documents (its background page reads PDFs itself).
      permissions: ['activeTab', 'scripting', 'storage', 'nativeMessaging', 'contextMenus', ...(firefox ? [] : ['sidePanel', 'offscreen'])],
      action: {},
      // Asked for one site at a time, only from the "Allow reading <site>" button (never at install).
      optional_host_permissions: ['https://*/*', 'http://*/*'],
      ...(E2E ? { host_permissions: ['<all_urls>'] } : {}),
      // The shortcut does what a click on the toolbar icon does (side panel or popup, as set).
      // Users can change it in chrome://extensions/shortcuts or about:addons.
      commands: {
        _execute_action: { suggested_key: { default: 'Alt+Shift+S' }, description: 'Summarize the page' },
      },
      ...(firefox
        ? {
            browser_specific_settings: {
              gecko: {
                id: FIREFOX_ID,
                strict_min_version: '140.0',
                // The page text goes to the local host and from there to the provider the user picks.
                data_collection_permissions: { required: ['websiteContent'] },
              },
            },
          }
        : { key: EXTENSION_KEY, side_panel: { default_path: 'sidepanel.html' } }),
    };
  },
});
