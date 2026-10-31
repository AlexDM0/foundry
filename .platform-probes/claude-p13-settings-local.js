// P13: a worktree's `.claude/settings.local.json` hook runs under `project,local` and not under `project`.
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

import { hookRecorderIn, observedSession, writeJsonFile } from './support/claude-session.js';
import { probe } from './support/probe.js';
import { createLinkedRepository, scratchFolder } from './support/scratch.js';

await probe({
  unknown: 'claude-p13-settings-local',
  needsClaudeProgram: true,
  observe: async () => {
    const { worktree } = await createLinkedRepository();
    mkdirSync(join(worktree, '.claude'));

    async function sessionUnderSources(settingSources) {
      const recorder = hookRecorderIn(scratchFolder());
      writeJsonFile(join(worktree, '.claude', 'settings.local.json'), { hooks: recorder.sessionStartHooks });
      const session = await observedSession({
        cwd: worktree,
        extraArguments: ['--setting-sources', settingSources],
        prompts: ['Reply with the single word ok.'],
      });
      return { hookMarkers: recorder.markers(), session };
    }

    return { projectAndLocal: await sessionUnderSources('project,local'), projectOnly: await sessionUnderSources('project') };
  },
});
