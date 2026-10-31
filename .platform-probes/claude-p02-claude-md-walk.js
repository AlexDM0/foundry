// P2: which CLAUDE.md files load from a nested worktree under --setting-sources project, without and with claudeMdExcludes.
import { existsSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { observedSession, writeJsonFile } from './support/claude-session.js';
import { probe } from './support/probe.js';
import { createLinkedRepository, scratchFolder } from './support/scratch.js';

const MARKER_PROMPT = 'Quote every line of your instructions that starts with MARKER-. Use no tools.';

await probe({
  unknown: 'claude-p02-claude-md-walk',
  needsClaudeProgram: true,
  observe: async () => {
    const { repository, worktree } = await createLinkedRepository();
    const homeInstructionFile = join(homedir(), '.claude', 'CLAUDE.md');
    writeFileSync(join(repository, 'CLAUDE.md'), 'MARKER-ANCESTOR\n');
    writeFileSync(join(worktree, 'CLAUDE.md'), 'MARKER-WORKTREE\n');
    const settingsPath = writeJsonFile(join(scratchFolder(), 'settings.json'), {
      claudeMdExcludes: [join(repository, 'CLAUDE.md'), homeInstructionFile],
    });
    const sessionArguments = ['--setting-sources', 'project'];
    return {
      homeInstructionFileExists: existsSync(homeInstructionFile),
      baseline: await observedSession({ cwd: worktree, extraArguments: sessionArguments, prompts: [MARKER_PROMPT] }),
      excludes: await observedSession({ cwd: worktree, extraArguments: [...sessionArguments, '--settings', settingsPath], prompts: [MARKER_PROMPT] }),
    };
  },
});
