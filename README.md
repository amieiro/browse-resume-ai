# Browse Resume AI

A Chrome extension that summarizes the article in the current tab with one click, using the AI
subscription you already pay for: Claude (through Claude Code) or ChatGPT (through Codex). No API
keys, no pay-per-use billing.

- One click on the toolbar icon summarizes the page with your saved settings.
- Choose the provider and model, the length (short, medium, long) and the summary language
  (Galician, Spanish, English, Portuguese, French, German, Italian, Catalan, Basque).
- The summary appears in the side panel or in a popup; you pick which in the settings.
- Interface in English and Galician.

Status: personal project, Chrome on macOS. A Firefox build is planned.

## Requirements

- macOS and Google Chrome.
- Node.js 18 or later.
- At least one of:
  - [Claude Code](https://docs.claude.com/en/docs/claude-code), logged in with your Claude
    subscription (run `claude` once).
  - [Codex CLI](https://developers.openai.com/codex), logged in with your ChatGPT plan
    (`codex login`).

## Install

```sh
git clone https://github.com/amieiro/browse-resume-ai.git
cd browse-resume-ai
npm install
npm run build
./native-host/install.sh
```

Then open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked** and choose
`.output/chrome-mv3`. Pin the extension and click its icon on any article.

### Why a local component?

Claude subscriptions can only be used through Claude Code, and Sign in with ChatGPT only accepts
redirects to `127.0.0.1`, which an extension cannot receive. So both providers go through a small
local program (a Chrome native messaging host) that runs `claude --print` or `codex exec` on your
computer, with your subscription.

The host gives the model no way to run commands or read files: Claude runs with no tools at all;
Codex runs with its shell and code execution disabled, inside a read-only sandbox. Each request
runs in an empty temporary directory that is deleted afterwards, and no session is saved.

```sh
./native-host/install.sh     # run again after moving the repository or upgrading Node, Claude Code or Codex
./native-host/uninstall.sh
```

The installer writes a launcher to `~/Library/Application Support/browse-resume-ai/` and the host
manifest to `~/Library/Application Support/Google/Chrome/NativeMessagingHosts/`. The host only
accepts connections from this extension's ID.

## Extension ID

The manifest pins the extension ID with a public key, so every build loaded from source gets the
same ID:

```
pdokiakaaeffjlabmofdppjakdhaimpi
```

## Privacy

- The extension reads a page only when you click its icon (`activeTab`). It never reads pages in
  the background.
- The article text (at most 100,000 characters), its title and URL go to the local component and
  from there to the provider you selected (Anthropic or OpenAI), under your own account. Nothing is
  sent anywhere else.
- The last summary of each tab is kept for the browser session, so clicking the icon again on the
  same page does not spend your quota. It is cleared when the tab closes.

## Permissions

| Permission | Why |
|---|---|
| `activeTab` | Read the page you clicked the icon on. |
| `scripting` | Run the article extractor (Mozilla Readability) in that page. |
| `storage` | Save your settings and the per-tab summary for the session. |
| `sidePanel` | Show summaries in the side panel. |
| `nativeMessaging` | Talk to the local component. |

## Development

```sh
npm install
npm run dev       # Chrome with the extension loaded and live reload
npm run build     # production build in .output/chrome-mv3
npm test          # unit tests (extension and native host)
npm run compile   # type check
```

Layout:

- `src/entrypoints/`: background service worker, side panel, popup, options page, and the
  extractor injected into pages.
- `src/lib/`: settings, prompt, extraction, Markdown rendering, cache and the per-tab summarizer.
- `src/providers/`: one module per provider behind a common interface.
- `native-host/`: the native messaging host (plain Node, no dependencies) and its installer.

## Licence

GPL-2.0-or-later. See [LICENSE](LICENSE).
