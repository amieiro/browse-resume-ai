# Browse Resume AI

A browser extension that summarizes the article in the current tab with one
click, using the AI subscription you already pay for.

## Extension ID

The manifest pins the extension ID with a public key, so every build loaded
from source gets the same ID:

```
pdokiakaaeffjlabmofdppjakdhaimpi
```

The native messaging host only accepts this ID.

## Local component for Claude

Claude subscriptions can only be used through Claude Code, so summaries with Claude go through a
small local program (a Chrome native messaging host) that runs `claude --print` with no tools.

Requirements: macOS, Google Chrome, Node.js 18 or later, and Claude Code logged in (run `claude` once).

```sh
./native-host/install.sh     # run again after moving the repository or upgrading Node or Claude Code
./native-host/uninstall.sh
```

The installer writes a launcher to `~/Library/Application Support/browse-resume-ai/` and the host
manifest to `~/Library/Application Support/Google/Chrome/NativeMessagingHosts/`. The host only
accepts connections from the extension ID above.

## Development

```sh
npm install
npm run dev     # Chrome with the extension loaded and live reload
npm run build   # production build in .output/chrome-mv3
npm test
```

## Licence

GPL-2.0-or-later. See [LICENSE](LICENSE).
