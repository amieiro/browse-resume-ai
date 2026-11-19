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

## Development

```sh
npm install
npm run dev     # Chrome with the extension loaded and live reload
npm run build   # production build in .output/chrome-mv3
npm test
```

## Licence

GPL-2.0-or-later. See [LICENSE](LICENSE).
