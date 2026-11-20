// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createCodexStreamParser } from '../lib/codex-stream.mjs';

const fixture = readFileSync(new URL('./fixtures/codex-stream.jsonl', import.meta.url));

function parse(chunks) {
  let text = '';
  const parser = createCodexStreamParser((t) => (text += t));
  for (const c of chunks) parser.write(c);
  return { text, summary: parser.end() };
}

describe('codex stream parser', () => {
  it('yields only the last agent message, once the turn completes', () => {
    expect(parse([fixture]).text).toBe('Ola ñandú 🙂\n\n- punto clave');
  });

  it('handles small chunks that split characters', () => {
    const chunks = [];
    for (let i = 0; i < fixture.length; i += 5) chunks.push(fixture.subarray(i, i + 5));
    expect(parse(chunks).text).toBe('Ola ñandú 🙂\n\n- punto clave');
  });

  it('does not treat the code-mode notice as a failure', () => {
    expect(parse([fixture]).summary.isError).toBe(false);
  });

  it('reports a failed turn', () => {
    const { text, summary } = parse([Buffer.from('{"type":"turn.failed","error":{"message":"401 Unauthorized"}}\n')]);
    expect(text).toBe('');
    expect(summary).toEqual({ isError: true, errorText: '401 Unauthorized', usage: null });
  });

  it('reports a top-level error event', () => {
    const { summary } = parse([Buffer.from('{"type":"error","message":"usage limit"}\n')]);
    expect(summary).toEqual({ isError: true, errorText: 'usage limit', usage: null });
  });

  it('reports an error when the turn never completed', () => {
    const { text, summary } = parse([Buffer.from('{"type":"item.completed","item":{"type":"agent_message","text":"half"}}\n')]);
    expect(text).toBe('');
    expect(summary.isError).toBe(true);
  });
});
