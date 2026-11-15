// Whether sandbox-exec can apply a profile when already sandboxed: under itself, and, given a Claude program, under
// Claude's own sandbox through a scripted session's Bash tool.
import { join } from 'node:path';

import { observedSession, sandboxSettingsOf, writeJsonFile } from './support/claude-session.js';
import { claudeProgramOption, probe } from './support/probe.js';
import { runProgram } from './support/programs.js';
import { scratchFolder } from './support/scratch.js';

const SANDBOX_EXEC = '/usr/bin/sandbox-exec';
const ALLOW_EVERYTHING_PROFILE = '(version 1)(allow default)';

function underClaudesSandbox() {
  if (claudeProgramOption() === null) return null;
  const folder = scratchFolder();
  const settingsPath = writeJsonFile(join(folder, 'settings.json'), { sandbox: sandboxSettingsOf() });
  const command = `${SANDBOX_EXEC} -p '${ALLOW_EVERYTHING_PROFILE}' /bin/echo nested`;
  return observedSession({
    cwd: folder,
    extraArguments: ['--settings', settingsPath, '--permission-mode', 'auto'],
    prompts: [`Run this exact command with the Bash tool, once, and print its output: ${command}`],
  });
}

await probe({
  unknown: 'sandbox-exec-nested',
  appliesTo: ['darwin'],
  observe: async () => ({
    direct: await runProgram([SANDBOX_EXEC, '-p', ALLOW_EVERYTHING_PROFILE, '/bin/echo', 'direct']),
    underItself: await runProgram([SANDBOX_EXEC, '-p', ALLOW_EVERYTHING_PROFILE, SANDBOX_EXEC, '-p', ALLOW_EVERYTHING_PROFILE, '/bin/echo', 'nested']),
    underClaudesSandbox: await underClaudesSandbox(),
  }),
});
