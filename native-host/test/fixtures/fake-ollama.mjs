// Stand-in for the Ollama HTTP API in tests: /api/version, /api/tags and a streamed /api/chat.
import { createServer } from 'node:http';

/**
 * Starts a fake Ollama on a free port. `models` are the installed models; a chat for another one
 * gets Ollama's 404. `chunks` are streamed as the answer; `failAfter` sends an error line instead
 * of the end. Returns the base URL, the requests received and a close function.
 */
export async function startFakeOllama({ models = ['llama3.2:latest'], chunks = ['Ola ', 'ñandú 🙂'], failAfter = false, hang = false } = {}) {
  const requests = [];
  const server = createServer((req, res) => {
    let body = '';
    req.on('data', (d) => (body += d));
    req.on('end', () => {
      requests.push({ method: req.method, url: req.url, body: body ? JSON.parse(body) : null });
      if (req.url === '/api/version') return res.end(JSON.stringify({ version: '0.12.0' }));
      if (req.url === '/api/tags') return res.end(JSON.stringify({ models: models.map((name) => ({ name, model: name })) }));
      if (req.url !== '/api/chat') return (res.statusCode = 404), res.end();
      const { model } = JSON.parse(body);
      const known = models.some((m) => m === model || m === `${model}:latest`);
      if (!known) {
        res.statusCode = 404;
        return res.end(JSON.stringify({ error: `model "${model}" not found, try pulling it first` }));
      }
      res.setHeader('content-type', 'application/x-ndjson');
      if (hang) return res.write(JSON.stringify({ message: { role: 'assistant', content: 'partial' }, done: false }) + '\n');
      // Lines are split mid-way on purpose, as a network may deliver them.
      const lines = chunks.map((c) => JSON.stringify({ message: { role: 'assistant', content: c }, done: false }) + '\n');
      lines.push(failAfter ? JSON.stringify({ error: 'model runner crashed' }) + '\n' : JSON.stringify({ message: { role: 'assistant', content: '' }, done: true, prompt_eval_count: 42, eval_count: 7 }) + '\n');
      const all = Buffer.from(lines.join(''));
      const mid = Math.floor(all.length / 2);
      res.write(all.subarray(0, mid));
      setTimeout(() => res.end(all.subarray(mid)), 10);
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address();
  return {
    url: `http://127.0.0.1:${port}`,
    requests,
    close: () => new Promise((r) => (server.closeAllConnections(), server.close(r))),
  };
}
