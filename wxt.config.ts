import { defineConfig } from 'wxt';

// Public key that pins the extension ID to pdokiakaaeffjlabmofdppjakdhaimpi.
// The private key lives outside the repository.
const EXTENSION_KEY =
  'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAoyhv1ZGLtMPsHoX+0omlJFxLrKKM7Ea34Wy3bOT8Xn6CPvGNRNDnHVUo/0vxGwYoYvinJOpsBm8MwMljaTGh7ySxx8pP5u45dXYqEwHxUUY6s01rQtd7ctFJD5mVU/z9uwZe0CxEp+aTWty+d0vaXrr+vzg+MP0LFTCHI6KPxD9JECRnBs0XeVkTeUpxSsumNX+d0ASUm/dHYOsct1smjfMJ0CZ56AxJm53HpKEzOrBk9pAmYWHBXTLHsw4wnU7JAxjO648B6sgHyeBzIVTZNcXTSC/EIOuPR42peNcxfl6UlYnKck3OTbXI/fhc6BagTXAYjMhF8+dEVng6UOFixQIDAQAB';

export default defineConfig({
  srcDir: 'src',
  publicDir: 'public',
  manifest: {
    name: '__MSG_extName__',
    description: '__MSG_extDescription__',
    default_locale: 'en',
    key: EXTENSION_KEY,
    permissions: ['activeTab', 'scripting', 'storage', 'sidePanel', 'nativeMessaging'],
    action: {},
    side_panel: { default_path: 'sidepanel.html' },
  },
});
