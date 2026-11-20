// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createClaudeStreamParser } from '../lib/claude-stream.mjs';

const fixture = readFileSync(new URL('./fixtures/claude-stream.jsonl', import.meta.url));
const EXPECTED = 'Ola ñandú 🙂\n\n- punto clave';

function parse(chunks) {
  let text = '';
  const parser = createClaudeStreamParser((t) => (text += t));
  for (const c of chunks) parser.write(c);
  const summary = parser.end();
  return { text, summary };
}

describe('claude stream parser', () => {
  it('yields the assistant text exactly once', () => {
    expect(parse([fixture]).text).toBe(EXPECTED);
  });

  it('handles the stream in small chunks that split characters', () => {
    const chunks = [];
    for (let i = 0; i < fixture.length; i += 7) chunks.push(fixture.subarray(i, i + 7));
    expect(parse(chunks).text).toBe(EXPECTED);
  });

  it('ignores lines that are not JSON', () => {
    const input = Buffer.concat([Buffer.from('Warning: something\n'), fixture]);
    expect(parse([input]).text).toBe(EXPECTED);
  });

  it('falls back to the result text when no deltas arrived', () => {
    const only = Buffer.from('{"type":"result","subtype":"success","is_error":false,"result":"Whole text"}\n');
    expect(parse([only]).text).toBe('Whole text');
  });

  it('reports an error result', () => {
    const err = Buffer.from('{"type":"result","is_error":true,"result":"Not logged in · Please run /login"}\n');
    const { text, summary } = parse([err]);
    expect(text).toBe('');
    expect(summary).toEqual({ isError: true, errorText: 'Not logged in · Please run /login', usage: null });
  });
});
