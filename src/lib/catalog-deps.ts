import { browser } from 'wxt/browser';
import { cliVersions, listModels } from '@/providers/native';
import type { CatalogDeps } from './model-catalog';

/** The model catalog's dependencies in the extension: the local host and the manifest version. */
export function catalogDeps(): CatalogDeps {
  return { listModels, cliVersions, now: () => Date.now(), extensionVersion: browser.runtime.getManifest().version };
}
