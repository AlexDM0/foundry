// P16: which --setting-sources values load the worktree's CLAUDE.md and its `.claude/settings.json` hook.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { hookRecorderIn, observedSession, writeJsonFile } from './support/claude-session.js';
import { probe } from './support/probe.js';
import { createLinkedRepository, scratchFolder } from './support/scratch.js';

const SETTING_SOURCES = { project: 'project', projectAndLocal: 'project,local', user: 'user', empty: '' };

await probe({
  unknown: 'claude-p16-setting-sources',
  needsClaudeProgram: true,
  observe: async () => {
    const { worktree } = await createLinkedRepository();
    mkdirSync(join(worktree, '.claude'));
    writeFileSync(join(worktree, 'CLAUDE.md'), 'MARKER-WORKTREE\n');
    const observed = {};
    for (const [runName, settingSources] of Object.entries(SETTING_SOURCES)) {
      const recorder = hookRecorderIn(scratchFolder());
      writeJsonFile(join(worktree, '.claude', 'settings.json'), { hooks: recorder.sessionStartHooks });
      const session = await observedSession({
        cwd: worktree,
        extraArguments: ['--setting-sources', settingSources],
        prompts: ['Quote every line of your instructions that starts with MARKER-, or say none. Use no tools.'],
      });
      observed[runName] = { settingSources, hookMarkers: recorder.markers(), session };
    }
    return observed;
  },
});
