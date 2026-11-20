import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createDecoder, encodeMessage } from '../native-host/lib/framing.mjs';
import { loadPromptBuilder } from './lib/shots.mjs';

const [, , articleFile, model, language] = process.argv;
const [title, ...rest] = readFileSync(articleFile, 'utf8').split('\n');
const buildPrompt = await loadPromptBuilder();
const prompt = buildPrompt({ title, text: rest.join('\n').trim(), url: 'https://example.com/a', truncated: false }, 'short', language);
const host = spawn(process.execPath, ['native-host/host.mjs'], { env: { ...process.env, OLLAMA_HOST: '127.0.0.1:11435' }, stdio: ['pipe', 'pipe', 'inherit'] });
const t0 = Date.now();
let text = '';
host.stdout.on('data', createDecoder((m) => {
  if (m.type === 'pong') console.log('pong', JSON.stringify(m));
  else if (m.type === 'chunk') text += m.text;
  else if (m.type === 'done' || m.type === 'error') {
    console.log(m.type, m.code ?? '', m.message ?? '', `${Date.now() - t0} ms`);
    console.log(text);
    host.stdin.end();
  }
}));
host.stdin.write(encodeMessage({ type: 'ping', ollama: true }));
host.stdin.write(encodeMessage({ type: 'summarize', id: 'e2e', provider: 'ollama', model, prompt }));
