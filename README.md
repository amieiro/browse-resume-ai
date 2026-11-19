# Browse Resume AI

A Chrome extension that summarizes the article in the current tab with one click, using the AI
subscription you already pay for: Claude (through Claude Code) or ChatGPT (through Codex). No API
keys, no pay-per-use billing.

- One click on the toolbar icon summarizes the page with your saved settings.
- Choose the provider and model, the length (short, medium, long) and the summary language.
- The summary appears in the side panel or in a popup; you pick which in the settings.
- 201 languages, for both the summary and the interface: the languages of
  [translate.wordpress.org](https://translate.wordpress.org/), with BCP 47 codes (ISO 639 language,
  ISO 3166 region, e.g. `gl-ES`, `pt-BR`) and ISO 639 names. The interface follows the browser
  language or the one you choose in the settings.

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

## For AI agents

This section is for a coding agent (Claude Code, Codex or similar) asked to set the extension up on
a user's machine.

### What this is

A Chrome Manifest V3 extension (WXT + TypeScript) plus a local Chrome native messaging host
(`native-host/`, plain Node, no dependencies). The extension extracts the article from the active
tab and sends the prompt to the host; the host runs `claude --print` or `codex exec` and streams the
text back. The user's Claude or ChatGPT subscription pays for the summaries; there are no API keys
to configure.

### Install

1. Check the prerequisites. Stop and tell the user what is missing if any check fails.

   ```sh
   uname                  # must print Darwin (the installer supports macOS only)
   node --version         # 18 or later
   command -v claude      # Claude Code, for the Claude provider
   command -v codex       # Codex CLI, for the Codex provider (at least one of the two)
   ```

   Do not log the user in yourself. If `claude` or `codex` is not logged in, ask the user to run
   `claude` (then `/login`) or `codex login`.

2. Build the extension and install the host:

   ```sh
   git clone https://github.com/amieiro/browse-resume-ai.git
   cd browse-resume-ai
   npm install
   npm run build              # output in .output/chrome-mv3
   ./native-host/install.sh   # prints the node, claude and codex paths it found
   ```

3. Check that the host answers. This must print a `pong` with `claudeFound` and/or `codexFound`
   set to `true`:

   ```sh
   node --input-type=module -e "
   import { spawn } from 'node:child_process';
   import { encodeMessage, createDecoder } from './native-host/lib/framing.mjs';
   const host = spawn(process.env.HOME + '/Library/Application Support/browse-resume-ai/launcher.sh');
   host.stdout.on('data', createDecoder((m) => { console.log(JSON.stringify(m)); host.stdin.end(); }));
   host.stdin.write(encodeMessage({ type: 'ping' }));
   "
   ```

4. Hand over to the user for the last step. Loading an unpacked extension needs Chrome's Developer
   mode and a native folder picker, which an agent should not and usually cannot operate. Give the
   user these instructions:
   - Open `chrome://extensions` and turn on **Developer mode**.
   - Click **Load unpacked** and choose the `.output/chrome-mv3` folder (give the absolute path).
   - Check that the extension ID is `pdokiakaaeffjlabmofdppjakdhaimpi`, then pin the extension
     and click its icon on an article.

### Rules

- Never pass the user's Claude subscription token to the extension or to any other tool. Claude is
  reached only through the user's own Claude Code.
- Do not change the flags in `native-host/lib/runner.mjs` or `native-host/lib/codex-runner.mjs`
  without re-running the prompt-injection check described in their comments: the page text is
  untrusted and the model must have no tool that runs commands or reads files.
- Run `./native-host/install.sh` again after moving the repository or upgrading Node, Claude Code
  or Codex, because the launcher stores absolute paths.

### Troubleshooting

| What the extension shows | Cause | Fix |
|---|---|---|
| The local component isn't installed or isn't answering | Host manifest missing, or the extension ID differs | Run `./native-host/install.sh`; check the ID in `chrome://extensions` |
| Claude Code wasn't found / Codex wasn't found | The CLI moved or was not installed when the installer ran | Install it and run `./native-host/install.sh` again |
| Claude Code isn't logged in | The Claude Code sign-in expired | The user runs `claude auth login` |
| Codex isn't logged in | Codex is signed out | The user runs `codex login` |
| No article text was found | The page is an app, a login wall or too short | Expected; try an article page |

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
- `src/lib/language-list.ts`: the language list; `src/locales/<code>.json`: interface strings, one
  file per language, with `en-US.json` as the source. The interface translations other than
  `en-US` and `gl-ES` were machine-translated and have not been reviewed by native speakers;
  corrections are welcome.
- `native-host/`: the native messaging host (plain Node, no dependencies) and its installer.

## Licence

GPL-2.0-or-later. See [LICENSE](LICENSE).
