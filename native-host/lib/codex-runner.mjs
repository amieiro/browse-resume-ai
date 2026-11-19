import { createCodexStreamParser } from './codex-stream.mjs';
import { runProcess } from './process.mjs';

// Settled against codex-cli 0.169.0. The page text is untrusted, so Codex must not run anything:
// - --disable shell_tool / unified_exec remove the shell tools; with --disable code_mode_host the
//   remaining exec tool fails closed ("command execution is unavailable").
// - --sandbox read-only and approval_policy "never" are a second layer if a tool slips through.
// - --ignore-user-config / --ignore-rules skip the user's config, MCP servers and rules (auth still
//   comes from CODEX_HOME); apps, plugins, hooks, browser and computer use are disabled too.
// - --ephemeral: no session files. Checked by hand: a prompt asking to cat a file and create another
//   produced neither.
const DISABLED_FEATURES = [
  'shell_tool',
  'unified_exec',
  'code_mode_host',
  'apps',
  'plugins',
  'hooks',
  'browser_use',
  'computer_use',
  'in_app_browser',
  'skill_search',
  'tool_suggest',
  'sleep_tool',
  'multi_agent',
  'view_image',
  'image_generation',
  'goals',
  'browser_use_external',
  'browser_use_full_cdp_access',
  'in_app_local_automation',
  'remote_plugin',
];

export function codexArgs(model, cwd) {
  return [
    'exec',
    '--json',
    '--ephemeral',
    '--skip-git-repo-check',
    '--ignore-user-config',
    '--ignore-rules',
    '--sandbox', 'read-only',
    '-C', cwd,
    '-m', model,
    '-c', 'approval_policy="never"',
    '-c', 'web_search="disabled"',
    ...DISABLED_FEATURES.flatMap((feature) => ['--disable', feature]),
    '-',
  ];
}

const AUTH_PATTERN = /401|unauthori[sz]ed|codex login|not logged in|sign in|log in/i;
const LIMIT_PATTERN = /usage limit|rate limit|429|quota/i;

export function classifyCodexError(detail) {
  if (LIMIT_PATTERN.test(detail)) return 'usage_limit';
  if (AUTH_PATTERN.test(detail)) return 'codex_signed_out';
  return 'provider_failed';
}

/** onError codes: codex_missing, codex_signed_out, usage_limit, provider_failed. */
export function runCodex({ codexPath, model, prompt, onText, onDone, onError }) {
  return runProcess({
    command: codexPath,
    args: (cwd) => codexArgs(model, cwd),
    prompt,
    parser: createCodexStreamParser(onText),
    classifyError: classifyCodexError,
    missingCode: 'codex_missing',
    onDone,
    onError,
  });
}
