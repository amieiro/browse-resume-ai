#!/usr/bin/env node
// Native messaging host for Browse Resume AI. Started by Chrome through the launcher that
// install.sh writes, which sets CLAUDE_BIN and CODEX_BIN to the absolute paths of the CLIs.
import { accessSync, constants } from 'node:fs';
import { createDecoder, encodeMessage } from './lib/framing.mjs';
import { validateRequest, VERSION } from './lib/protocol.mjs';
import { runCodex } from './lib/codex-runner.mjs';
import { runClaude } from './lib/runner.mjs';

const CLAUDE_BIN = process.env.CLAUDE_BIN || 'claude';
const CODEX_BIN = process.env.CODEX_BIN || 'codex';
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
    send({ type: 'pong', version: VERSION, claudeFound: isExecutable(CLAUDE_BIN), codexFound: isExecutable(CODEX_BIN) });
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
      msg.provider === 'codex'
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
