// P4: curl without and with allowed_domains and a WebFetch of an unlisted domain, under the classifier alone,
// strictAllowlist, and a PreToolUse guard hook standing in for `hook bash-domains`.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { observedSession, sandboxSettingsOf, writeJsonFile } from './support/claude-session.js';
import { probe } from './support/probe.js';
import { scratchFolder } from './support/scratch.js';

const GUARD_PROMPT = [
  'Do these three steps in order, whatever the outcome of each, then report each outcome:',
  '1. With the Bash tool run: curl -sS -m 10 -o /dev/null -w "%{http_code}" https://example.com',
  '2. With the Bash tool run the same command, with the tool parameter allowed_domains set to ["example.com"].',
  '3. With the WebFetch tool fetch https://example.org and report its first line.',
].join('\n');

const GUARD_HOOK_SOURCE = `
const toolCall = JSON.parse(await new Response(Bun.stdin.stream()).text());
if (toolCall.tool_input?.allowed_domains !== undefined || toolCall.tool_input?.url !== undefined) {
  console.log(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: 'Denied by the probe guard.' } }));
}
`;

function guardHooksIn(folder) {
  const hookPath = join(folder, 'guard-hook.mjs');
  writeFileSync(hookPath, GUARD_HOOK_SOURCE);
  return { PreToolUse: [{ matcher: 'Bash|WebFetch', hooks: [{ type: 'command', command: `"${process.execPath}" "${hookPath}"` }] }] };
}

function sessionUnder(settings) {
  const folder = scratchFolder();
  const settingsPath = writeJsonFile(join(folder, 'settings.json'), typeof settings === 'function' ? settings(folder) : settings);
  return observedSession({
    cwd: folder,
    extraArguments: ['--settings', settingsPath, '--strict-mcp-config', '--permission-mode', 'auto'],
    prompts: [GUARD_PROMPT],
  });
}

await probe({
  unknown: 'claude-p04-network-guard',
  needsClaudeProgram: true,
  observe: async () => ({
    classifierAlone: await sessionUnder({ sandbox: sandboxSettingsOf() }),
    strictAllowlist: await sessionUnder({ sandbox: sandboxSettingsOf({ network: { strictAllowlist: true } }) }),
    guardHook: await sessionUnder((folder) => ({ sandbox: sandboxSettingsOf(), hooks: guardHooksIn(folder) })),
  }),
});
