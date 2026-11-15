// P17: permissions.blockReadsOutsideWorkingDirectories: git keeps working in the worktree while reads and scripts
// outside it are refused, against a control session without the setting.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { observedSession, sandboxSettingsOf, writeJsonFile } from './support/claude-session.js';
import { probe } from './support/probe.js';
import { createLinkedRepository, scratchFolder } from './support/scratch.js';

await probe({
  unknown: 'claude-p17-block-outside-reads',
  needsClaudeProgram: true,
  observe: async () => {
    const { repository, worktree, common } = await createLinkedRepository();
    const outside = scratchFolder();
    const outsideFile = join(outside, 'outside.txt');
    const outsideScript = join(outside, 'outside.sh');
    const mainCheckoutFile = join(repository, 'CLAUDE.md');
    writeFileSync(outsideFile, 'outside\n');
    writeFileSync(outsideScript, 'echo ran-outside\n');
    writeFileSync(mainCheckoutFile, 'main checkout\n');

    function sessionWithPermissions(permissions) {
      const settingsPath = writeJsonFile(join(scratchFolder(), 'settings.json'), {
        sandbox: sandboxSettingsOf({ filesystem: { allowWrite: [worktree, common] } }),
        permissions,
      });
      return observedSession({
        cwd: worktree,
        extraArguments: ['--settings', settingsPath, '--permission-mode', 'auto'],
        prompts: [[
          'Run each with the Bash tool, whatever the outcome, and print each output and exit code:',
          'git rev-parse --git-common-dir',
          'git status --short',
          'git log -1 --oneline',
          `cat '${join(common, 'config')}'`,
          'git -c user.name=Probe -c user.email=probe@example.com -c commit.gpgsign=false commit --allow-empty -m probe',
          `cat '${mainCheckoutFile}'`,
          `cat '${outsideFile}'`,
          `sh '${outsideScript}'`,
          `Then use the Read tool on ${mainCheckoutFile} and on ${outsideFile}, and report each outcome.`,
        ].join('\n')],
      });
    }

    return {
      settingOn: await sessionWithPermissions({ blockReadsOutsideWorkingDirectories: true }),
      control: await sessionWithPermissions({}),
    };
  },
});
