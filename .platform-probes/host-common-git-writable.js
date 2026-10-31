// Whether the common .git stays writable from a linked worktree when allowWrite never names it.
import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { observedSession, sandboxSettingsOf, writeJsonFile } from './support/claude-session.js';
import { probe } from './support/probe.js';
import { createLinkedRepository, git } from './support/scratch.js';

await probe({
  unknown: 'host-common-git-writable',
  appliesTo: ['darwin', 'linux'],
  needsClaudeProgram: true,
  observe: async () => {
    const { worktree, common } = await createLinkedRepository();
    const markerPath = join(common, 'probe-marker');
    const settingsPath = writeJsonFile(join(common, '..', 'settings.json'), {
      sandbox: sandboxSettingsOf({ filesystem: { allowWrite: [worktree] } }),
    });
    const session = await observedSession({
      cwd: worktree,
      extraArguments: ['--settings', settingsPath, '--permission-mode', 'auto'],
      prompts: [[
        'Run these with the Bash tool, one call, and print all their output:',
        `git -c user.name=Probe -c user.email=probe@example.com -c commit.gpgsign=false commit --allow-empty -m probe; echo "commit exit $?"; touch '${markerPath}'; echo "touch exit $?"`,
      ].join('\n')],
    });
    return {
      markerWritten: existsSync(markerPath),
      commitsOnWorktree: (await git(worktree, 'log', '--oneline')).stdout,
      session,
    };
  },
});
