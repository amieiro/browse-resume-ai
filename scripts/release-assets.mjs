// Builds the three files attached to each GitHub release, in .output/release, with names that do
// not change between versions, so .../releases/latest/download/<name> always gets the latest:
//   browse-resume-ai-chrome.zip       the extension for Chrome (unzip, then Load unpacked)
//   browse-resume-ai-firefox.zip      the add-on for Firefox (Load Temporary Add-on takes the zip)
//   browse-resume-ai-native-host.zip  the local component: native-host/, package.json, LICENSE
// Run with: npm run release-assets (it zips the builds first).
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const { version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const out = join(root, '.output/release');
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

for (const browser of ['chrome', 'firefox']) {
  copyFileSync(join(root, `.output/browse-resume-ai-${version}-${browser}.zip`), join(out, `browse-resume-ai-${browser}.zip`));
}
// The host reads its version from ../package.json, so the zip keeps the repository layout.
execFileSync('zip', ['-qr', join(out, 'browse-resume-ai-native-host.zip'), 'package.json', 'LICENSE', 'native-host', '-x', 'native-host/test/*'], { cwd: root });
console.log(`release files for ${version} in ${out}`);
