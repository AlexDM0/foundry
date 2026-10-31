// P3: --disable-slash-commands empties skills and slash commands and leaves subagents working.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { observedSession } from './support/claude-session.js';
import { probe } from './support/probe.js';
import { createLinkedRepository, git } from './support/scratch.js';

const SUBAGENT_PROMPT = 'Use the general-purpose subagent to reply with the single word ok, then say done.';
const SKILL_TEXT = '---\nname: probe-skill\ndescription: A probe skill.\n---\nSay probe.\n';

await probe({
  unknown: 'claude-p03-disable-slash-commands',
  needsClaudeProgram: true,
  observe: async () => {
    const { worktree } = await createLinkedRepository();
    const skillFolder = join(worktree, '.claude', 'skills', 'probe-skill');
    mkdirSync(skillFolder, { recursive: true });
    writeFileSync(join(skillFolder, 'SKILL.md'), SKILL_TEXT);
    await git(worktree, 'add', '.');
    await git(worktree, 'commit', '-m', 'Add the skill');
    const sessionArguments = ['--permission-mode', 'auto'];
    return {
      withFlag: await observedSession({ cwd: worktree, extraArguments: [...sessionArguments, '--disable-slash-commands'], prompts: [SUBAGENT_PROMPT] }),
      withoutFlag: await observedSession({ cwd: worktree, extraArguments: sessionArguments, prompts: ['Reply with the single word ok.'] }),
    };
  },
});
