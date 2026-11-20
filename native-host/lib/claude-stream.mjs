// Parses `claude --print --output-format stream-json --include-partial-messages` output.
// Text comes from text_delta stream events only; the full assistant message and the result
// repeat that text and are ignored, except as a fallback when no deltas arrived.
import { StringDecoder } from 'node:string_decoder';
import { claudeUsage } from './usage.mjs';

export function createClaudeStreamParser(onText) {
  const decoder = new StringDecoder('utf8');
  let pending = '';
  let sawDelta = false;
  let isError = false;
  let errorText = '';
  let usage = null;

  const handleLine = (line) => {
    if (!line.trim()) return;
    let event;
    try {
      event = JSON.parse(line);
    } catch {
      return;
    }
    if (event.type === 'stream_event') {
      const delta = event.event?.type === 'content_block_delta' ? event.event.delta : undefined;
      if (delta?.type === 'text_delta' && typeof delta.text === 'string' && delta.text) {
        sawDelta = true;
        onText(delta.text);
      }
    } else if (event.type === 'result') {
      usage = claudeUsage(event.usage);
      if (event.is_error) {
        isError = true;
        errorText = typeof event.result === 'string' ? event.result : '';
      } else if (!sawDelta && typeof event.result === 'string' && event.result) {
        onText(event.result);
      }
    }
  };

  return {
    write(chunk) {
      pending += decoder.write(chunk);
      const lines = pending.split('\n');
      pending = lines.pop() ?? '';
      lines.forEach(handleLine);
    },
    /** Flushes the last line and reports whether the run ended with an error result, and the tokens used. */
    end() {
      pending += decoder.end();
      handleLine(pending);
      pending = '';
      return { isError, errorText, usage };
    },
  };
}
