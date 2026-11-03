// `git worktree remove` while a process has its working directory in the worktree: what git says, and what is left,
// `.git` first of all, then the same removal once the holder is gone.
import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { probe, settleBoundedMilliseconds } from './support/probe.js';
import { killQuietly, sleepMilliseconds, startSleeper } from './support/programs.js';
import { createLinkedRepository, git } from './support/scratch.js';

const HOLDER_SETTLE_MILLISECONDS = settleBoundedMilliseconds(500);

const worktreeStateOf = async ({ repository, worktree }) => ({
  worktreeExists: existsSync(worktree),
  dotGitExists: existsSync(join(worktree, '.git')),
  trackedFileExists: existsSync(join(worktree, 'file.txt')),
  worktreeList: (await git(repository, 'worktree', 'list', '--porcelain')).stdout,
});

await probe({
  unknown: 'worktree-remove-held-cwd',
  observe: async () => {
    const layout = await createLinkedRepository();
    const holder = startSleeper({ detached: false, cwd: layout.worktree });
    await sleepMilliseconds(HOLDER_SETTLE_MILLISECONDS);
    const whileHeld = await git(layout.repository, 'worktree', 'remove', '--force', layout.worktree);
    const stateWhileHeld = await worktreeStateOf(layout);
    killQuietly(holder.pid);
    await sleepMilliseconds(HOLDER_SETTLE_MILLISECONDS);
    const afterRelease = await git(layout.repository, 'worktree', 'remove', '--force', layout.worktree);
    return { whileHeld, stateWhileHeld, afterRelease, stateAfterRelease: await worktreeStateOf(layout) };
  },
});
