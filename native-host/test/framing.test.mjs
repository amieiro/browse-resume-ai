// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createDecoder, encodeMessage } from '../lib/framing.mjs';

function decodeAll(chunks) {
  const out = [];
  const decode = createDecoder((m) => out.push(m));
  for (const c of chunks) decode(c);
  return out;
}

describe('native messaging framing', () => {
  it('round-trips a message', () => {
    const msg = { type: 'chunk', id: 'a', text: 'hello' };
    expect(decodeAll([encodeMessage(msg)])).toEqual([msg]);
  });

  it('prefixes a 4-byte length', () => {
    const buf = encodeMessage({ a: 1 });
    expect(buf.readUInt32LE(0)).toBe(buf.length - 4);
  });

  it('decodes two messages in one chunk', () => {
    const both = Buffer.concat([encodeMessage({ n: 1 }), encodeMessage({ n: 2 })]);
    expect(decodeAll([both])).toEqual([{ n: 1 }, { n: 2 }]);
  });

  it('decodes a message split at every offset', () => {
    const buf = encodeMessage({ type: 'x', text: 'abcdef' });
    for (let i = 1; i < buf.length; i++) {
      expect(decodeAll([buf.subarray(0, i), buf.subarray(i)])).toEqual([{ type: 'x', text: 'abcdef' }]);
    }
  });

  it('keeps multi-byte characters split across chunks intact', () => {
    const buf = encodeMessage({ text: 'ñ🙂' });
    const chunks = [...buf].map((b) => Buffer.from([b]));
    expect(decodeAll(chunks)).toEqual([{ text: 'ñ🙂' }]);
  });
});
