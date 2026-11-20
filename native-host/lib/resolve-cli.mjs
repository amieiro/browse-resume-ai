// Windows support for starting the claude and codex CLIs.
//
// npm installs CLIs on Windows as .cmd shims, and Node can only start .cmd or .bat files through
// cmd.exe, which would mean building a shell command line. The host never does that, so the
// installer resolves a shim to the JavaScript file it runs, and the host starts that file with
// Node. Native executables (claude.exe, or anything on macOS and Linux) are started directly.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SHIM_TARGET = /"%~?dp0%?\\([^"%]+\.(?:js|mjs|cjs))"/i;

/** Returns the JavaScript entry point of an npm .cmd shim, or the path unchanged. */
export function resolveCli(path) {
  if (!/\.cmd$/i.test(path)) return path;
  let shim;
  try {
    shim = readFileSync(path, 'utf8');
  } catch {
    return path;
  }
  const match = SHIM_TARGET.exec(shim);
  return match ? join(dirname(path), ...match[1].split('\\')) : path;
}

/** How to start a CLI path: JavaScript files run with this Node, executables directly. */
export function commandFor(path) {
  if (/\.(cmd|bat)$/i.test(path)) {
    throw new Error(`${path} can only be started through a shell; run the installer again`);
  }
  if (/\.(js|mjs|cjs)$/i.test(path)) return { command: process.execPath, prefix: [path] };
  return { command: path, prefix: [] };
}

// Used by install.ps1: node resolve-cli.mjs <path> prints the path to store in the launcher.
if (process.argv[1] === fileURLToPath(import.meta.url) && process.argv[2]) {
  process.stdout.write(resolveCli(process.argv[2]));
}
