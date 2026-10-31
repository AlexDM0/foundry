// P11: a session in a plain folder under `<worktrees>/sessions/J3/`: the main checkout's skill and CLAUDE.md, and its
// writes, with the Hatch deny over every Hatch folder and then over the other job's alone.
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { observedSession, rootAnchored, sandboxSettingsOf, writeJsonFile } from './support/claude-session.js';
import { probe } from './support/probe.js';
import { createLinkedRepository, scratchFolder } from './support/scratch.js';

const SKILL_TEXT = '---\nname: agent-po\ndescription: A probe skill.\n---\nSay probe.\n';

await probe({
  unknown: 'claude-p11-product-owner-session',
  needsClaudeProgram: true,
  observe: async () => {
    const { repository, data, worktrees } = await createLinkedRepository();
    const hatch = join(worktrees, 'hatch');
    const sessionFolder = join(worktrees, 'sessions', 'J3');
    for (const folder of [sessionFolder, join(hatch, 'J2'), join(hatch, 'J3'), join(repository, '.claude', 'skills', 'agent-po')]) {
      mkdirSync(folder, { recursive: true });
    }
    writeFileSync(join(repository, '.claude', 'skills', 'agent-po', 'SKILL.md'), SKILL_TEXT);
    writeFileSync(join(repository, 'CLAUDE.md'), 'MARKER-MAIN-CHECKOUT\n');

    async function sessionWithHatchDenyOver(deniedFolder, runName) {
      const targets = {
        ownSessionFolder: join(sessionFolder, `${runName}.txt`),
        gates: join(data, 'gates', `${runName}.txt`),
        otherHatch: join(hatch, 'J2', `${runName}.txt`),
        ownHatch: join(hatch, 'J3', `${runName}.txt`),
      };
      const settingsPath = writeJsonFile(join(scratchFolder(), 'settings.json'), {
        sandbox: sandboxSettingsOf({ filesystem: { allowWrite: [join(hatch, 'J3'), sessionFolder], denyWrite: [data] } }),
        permissions: { deny: [`Edit(${rootAnchored(deniedFolder)}/**)`, `Write(${rootAnchored(deniedFolder)}/**)`] },
      });
      const session = await observedSession({
        cwd: sessionFolder,
        extraArguments: ['--settings', settingsPath, '--setting-sources', 'project', '--permission-mode', 'auto'],
        prompts: [[
          'Quote the instruction line that starts with MARKER-. Then run each with the Bash tool, whatever the outcome, and print each outcome:',
          ...Object.values(targets).map((target) => `echo probe > '${target}'`),
        ].join('\n')],
      });
      return { filesWritten: Object.fromEntries(Object.entries(targets).map(([name, path]) => [name, existsSync(path)])), session };
    }

    return {
      denyOverEveryHatchFolder: await sessionWithHatchDenyOver(hatch, 'every-hatch'),
      denyOverOtherJobOnly: await sessionWithHatchDenyOver(join(hatch, 'J2'), 'other-job'),
    };
  },
});
