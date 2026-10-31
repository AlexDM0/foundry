// Whether `claude -p` with sandbox.failIfUnavailable exits where the sandbox is missing, and with what code; the
// session with the setting off is the comparison.
import { join } from 'node:path';

import { observedSession, sandboxSettingsOf, writeJsonFile } from './support/claude-session.js';
import { probe } from './support/probe.js';
import { scratchFolder } from './support/scratch.js';

function sessionWithFailIfUnavailable(failIfUnavailable) {
  const folder = scratchFolder();
  const settingsPath = writeJsonFile(join(folder, 'settings.json'), { sandbox: { ...sandboxSettingsOf(), failIfUnavailable } });
  return observedSession({
    cwd: folder,
    extraArguments: ['--settings', settingsPath],
    prompts: ['Reply with the single word ok.'],
  });
}

await probe({
  unknown: 'host-fail-if-unavailable',
  needsClaudeProgram: true,
  observe: async () => ({
    settingOn: await sessionWithFailIfUnavailable(true),
    settingOff: await sessionWithFailIfUnavailable(false),
  }),
});
