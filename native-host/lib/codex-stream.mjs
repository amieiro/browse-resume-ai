// Parses `codex exec --json` output. Codex reports whole messages, not text deltas, and may send a
// short preamble message before the answer, so only the last agent message of a completed turn is
// passed on.
import { StringDecoder } from 'node:string_decoder';

export function createCodexStreamParser(onText) {
  const decoder = new StringDecoder('utf8');
  let pending = '';
  let lastMessage = '';
  let completed = false;
  let isError = false;
  let errorText = '';

  const handleLine = (line) => {
    if (!line.trim()) return;
    let event;
    try {
      event = JSON.parse(line);
    } catch {
      return;
    }
    if (event.type === 'item.completed' && event.item?.type === 'agent_message' && typeof event.item.text === 'string') {
      lastMessage = event.item.text;
    } else if (event.type === 'turn.completed') {
      completed = true;
      if (lastMessage) onText(lastMessage);
    } else if (event.type === 'turn.failed') {
      isError = true;
      errorText = event.error?.message ?? 'turn failed';
    } else if (event.type === 'error') {
      isError = true;
      errorText = event.message ?? 'error';
    }
  };

  return {
    write(chunk) {
      pending += decoder.write(chunk);
      const lines = pending.split('\n');
      pending = lines.pop() ?? '';
      lines.forEach(handleLine);
    },
    end() {
      pending += decoder.end();
      handleLine(pending);
      pending = '';
      if (!isError && !completed) return { isError: true, errorText: 'Codex ended before the turn completed' };
      return { isError, errorText };
    },
  };
}
