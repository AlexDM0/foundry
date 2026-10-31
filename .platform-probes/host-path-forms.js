// The platform's form of $CLAUDE_PROJECT_DIR and transcript_path, as a SessionStart hook and the Bash tool receive them.
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

import { hookRecorderIn, observedSession, writeJsonFile } from './support/claude-session.js';
import { probe } from './support/probe.js';
import { createRepository, scratchFolder } from './support/scratch.js';

await probe({
  unknown: 'host-path-forms',
  needsClaudeProgram: true,
  observe: async () => {
    const recorderFolder = scratchFolder();
    const repository = await createRepository(join(scratchFolder(), 'repo'));
    const recorder = hookRecorderIn(recorderFolder);
    mkdirSync(join(repository, '.claude'));
    writeJsonFile(join(repository, '.claude', 'settings.json'), { hooks: recorder.sessionStartHooks });
    const session = await observedSession({
      cwd: repository,
      extraArguments: ['--setting-sources', 'project', '--permission-mode', 'auto'],
      prompts: ['Run `echo "$CLAUDE_PROJECT_DIR"` with the Bash tool, once, and print its output.'],
    });
    return { repository, hookMarkers: recorder.markers(), toolResults: session.toolResults, exitCode: session.exitCode, stderr: session.stderr };
  },
});
