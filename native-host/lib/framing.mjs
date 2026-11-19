// Chrome native messaging framing: a 32-bit length in native byte order, then UTF-8 JSON.
import { endianness } from 'node:os';

const LITTLE = endianness() === 'LE';

export function encodeMessage(obj) {
  const body = Buffer.from(JSON.stringify(obj), 'utf8');
  const header = Buffer.alloc(4);
  if (LITTLE) header.writeUInt32LE(body.length, 0);
  else header.writeUInt32BE(body.length, 0);
  return Buffer.concat([header, body]);
}

/** Returns a function to feed raw stdin chunks; calls onMessage once per complete message. */
export function createDecoder(onMessage) {
  let buffer = Buffer.alloc(0);
  return (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    while (buffer.length >= 4) {
      const length = LITTLE ? buffer.readUInt32LE(0) : buffer.readUInt32BE(0);
      if (buffer.length < 4 + length) return;
      const body = buffer.subarray(4, 4 + length).toString('utf8');
      buffer = buffer.subarray(4 + length);
      let message;
      try {
        message = JSON.parse(body);
      } catch {
        continue;
      }
      onMessage(message);
    }
  };
}
