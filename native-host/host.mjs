#!/usr/bin/env node
// Native messaging host for Browse Resume AI. Started by Chrome through the launcher that
// install.sh writes, which sets CLAUDE_BIN and CODEX_BIN to the absolute paths of the CLIs.
// Ollama is reached over HTTP, at OLLAMA_HOST or 127.0.0.1:11434.
import { accessSync, constants } from 'node:fs';
import { createDecoder, encodeMessage } from './lib/framing.mjs';
import { validateRequest, VERSION } from './lib/protocol.mjs';
import { runCodex } from './lib/codex-runner.mjs';
import { checkOllama, ollamaBaseUrl, runOllama } from './lib/ollama-runner.mjs';
import { runClaude } from './lib/runner.mjs';

const CLAUDE_BIN = process.env.CLAUDE_BIN || 'claude';
const CODEX_BIN = process.env.CODEX_BIN || 'codex';
const OLLAMA_URL = ollamaBaseUrl(process.env.OLLAMA_HOST);
const running = new Map();

const send = (msg) => process.stdout.write(encodeMessage(msg));

function isExecutable(path) {
  try {
    accessSync(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function handle(msg) {
  const problem = validateRequest(msg);
  if (problem) {
    send({ type: 'error', id: typeof msg?.id === 'string' ? msg.id : null, code: 'bad_request', message: problem });
    return;
  }
  if (msg.type === 'ping') {
    const pong = { type: 'pong', version: VERSION, claudeFound: isExecutable(CLAUDE_BIN), codexFound: isExecutable(CODEX_BIN) };
    // Checking Ollama is a network request, so only the Ollama provider asks for it.
    if (msg.ollama === true) {
      void checkOllama(OLLAMA_URL).then(({ found, models }) => send({ ...pong, ollamaFound: found, ollamaModels: models }));
    } else {
      send(pong);
    }
  } else if (msg.type === 'cancel') {
    running.get(msg.id)?.cancel();
    running.delete(msg.id);
  } else if (msg.type === 'summarize') {
    running.get(msg.id)?.cancel();
    const { id } = msg;
    const callbacks = {
      model: msg.model,
      prompt: msg.prompt,
      onText: (text) => send({ type: 'chunk', id, text }),
      onDone: () => {
        running.delete(id);
        send({ type: 'done', id });
      },
      onError: (code, message) => {
        running.delete(id);
        send({ type: 'error', id, code, message: message ?? code });
      },
    };
    running.set(
      id,
      msg.provider === 'ollama'
        ? runOllama({ baseUrl: OLLAMA_URL, ...callbacks })
        : msg.provider === 'codex'
          ? runCodex({ codexPath: CODEX_BIN, ...callbacks })
          : runClaude({ claudePath: CLAUDE_BIN, ...callbacks }),
    );
  }
}

process.stdin.on('data', createDecoder(handle));
process.stdin.on('end', () => {
  for (const run of running.values()) run.cancel();
  process.exit(0);
});
