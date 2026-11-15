// P6: --resume keeps the id, recalls the earlier turn and returns a schema-valid result, its settings a fresh file of
// the same content at another path.
import { join } from 'node:path';

import { observedSession, writeJsonFile } from './support/claude-session.js';
import { probe } from './support/probe.js';
import { scratchFolder } from './support/scratch.js';

const WORD_SCHEMA = { type: 'object', properties: { word: { type: 'string' } }, required: ['word'] };
const PROBE_SETTINGS = { autoMemoryEnabled: false };

await probe({
  unknown: 'claude-p06-resume',
  needsClaudeProgram: true,
  observe: async () => {
    const workingFolder = scratchFolder();
    const settingsFolder = scratchFolder();
    const sessionId = crypto.randomUUID();
    const sessionArguments = ['--setting-sources', 'project', '--permission-mode', 'auto', '--permission-prompt-tool', 'stdio'];
    const firstSettings = writeJsonFile(join(settingsFolder, 'first.json'), PROBE_SETTINGS);
    const resumedSettings = writeJsonFile(join(settingsFolder, 'resumed.json'), PROBE_SETTINGS);
    return {
      sessionId,
      first: await observedSession({
        cwd: workingFolder,
        extraArguments: ['--session-id', sessionId, '--settings', firstSettings, ...sessionArguments],
        prompts: ['Remember the word cobalt. Reply with the single word ok.'],
      }),
      resumed: await observedSession({
        cwd: workingFolder,
        extraArguments: ['--resume', sessionId, '--json-schema', JSON.stringify(WORD_SCHEMA), '--settings', resumedSettings, ...sessionArguments],
        prompts: ['Return the word you were asked to remember.'],
      }),
    };
  },
});
