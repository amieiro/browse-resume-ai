// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { classifyCodexError } from '../lib/codex-runner.mjs';
import { classifyClaudeError } from '../lib/runner.mjs';

describe('classifyClaudeError', () => {
  it.each([
    ['Not logged in · Please run /login', 'claude_auth'],
    ['Invalid API key · Please log in again', 'claude_auth'],
    ['OAuth token has expired', 'claude_auth'],
    ["You've hit your usage limit · resets 3pm", 'usage_limit'],
    ['Claude AI usage limit reached', 'usage_limit'],
    ['rate limit exceeded', 'usage_limit'],
  ])('%j → %s', (detail, code) => {
    expect(classifyClaudeError(detail)).toBe(code);
  });

  it.each([
    'Failed to read the catalog in /tmp/x',
    'The blog in question could not be parsed',
    'Model overloaded, try again',
  ])('does not take %j for a login or limit problem', (detail) => {
    expect(classifyClaudeError(detail)).toBe('provider_failed');
  });
});

describe('classifyCodexError', () => {
  it.each([
    ['unexpected status 401 Unauthorized: Please run codex login', 'codex_signed_out'],
    ['Not logged in. Run codex login.', 'codex_signed_out'],
    ['Please sign in again', 'codex_signed_out'],
    ["You've hit your usage limit. Try again later.", 'usage_limit'],
    ['unexpected status 429 Too Many Requests', 'usage_limit'],
    ['Quota exceeded for this plan', 'usage_limit'],
  ])('%j → %s', (detail, code) => {
    expect(classifyCodexError(detail)).toBe(code);
  });

  it.each([
    'Processed 4012 tokens before the stream ended',
    'Request id 14290 failed with a server error',
    'Could not open the design in the sandbox',
    'Failed to read the catalog in /tmp/x',
  ])('does not take %j for a login or limit problem', (detail) => {
    expect(classifyCodexError(detail)).toBe('provider_failed');
  });
});
