# End-to-end check of the extension and the native host on Linux (Debian, Chromium).
# Build context: the repository root. Run with: npm run test:linux
FROM node:22-bookworm
RUN apt-get update \
  && apt-get install -y --no-install-recommends chromium \
  && rm -rf /var/lib/apt/lists/*
RUN useradd --create-home tester
COPY --chown=tester:tester . /app
USER tester
WORKDIR /app
RUN npm ci --ignore-scripts && npx wxt prepare >/dev/null
# Stand-ins for the claude and codex CLIs (no account, no network), on PATH like the real ones.
RUN mkdir -p /home/tester/bin \
  && cp native-host/test/fixtures/fake-claude.mjs /home/tester/bin/claude \
  && cp native-host/test/fixtures/fake-codex.mjs /home/tester/bin/codex \
  && cp native-host/test/fixtures/claude-stream.jsonl native-host/test/fixtures/codex-stream.jsonl native-host/test/fixtures/codex-models.json /home/tester/bin/ \
  && chmod +x /home/tester/bin/claude /home/tester/bin/codex
ENV PATH=/home/tester/bin:$PATH
CMD ["sh", "test/linux/run.sh"]
