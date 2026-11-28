/** Each git problem words as the sentence its verdict's reason held before the problem was typed. */
import { describe, expect, test } from 'bun:test';

import type { GitProblem, GitRunFailure } from '../lib/git/@types/GitProblem.ts';
import type { GroupWorktreeProblem }      from '../shared/@types/GroupWorktreeProblem.ts';
import { GitProblemWording }              from './GitProblemWording.ts';

const EXITED: GitRunFailure = {
  code: 'git-exited', gitArguments: ['worktree', 'remove', '/w/a'], exitCode: 128, gitMessage: 'fatal: locked'
};

const SENTENCES: readonly (readonly [GitProblem | GroupWorktreeProblem, string])[] = [
  [EXITED, 'git worktree remove /w/a exited with 128: fatal: locked'],
  [{ code: 'git-not-started', gitArguments: ['worktree', 'prune'] }, 'git worktree prune could not be started.'],
  [{ ...EXITED, code: 'git-exited-without-tree' }, 'git worktree remove /w/a exited with 128: fatal: locked (no tree written)'],
  [{ code: 'batch-record-without-tree', recordStatus: '1' }, 'git merge-tree --stdin wrote no tree for a record (status 1).'],
  [{ code: 'batch-record-status-unknown', recordStatus: '7' }, 'git merge-tree --stdin answered status 7 for a record.'],
  [{ code: 'batch-records-miscounted', pairCount: 3 }, 'git merge-tree --stdin did not print one record for each of the 3 pairs.'],
  [{ code: 'index-lock-not-removed', lockPath: '/g/index.lock', systemError: 'Error: EPERM' }, '/g/index.lock could not be removed: Error: EPERM'],
  [{ code: 'untracked-file-not-saved', untrackedFile: 'a.txt' }, 'git diff --no-index could not save the untracked file a.txt.'],
  [{ code: 'patch-not-written', patchPath: '/j/p.patch', systemError: 'Error: EROFS' }, '/j/p.patch could not be written: Error: EROFS'],
  [{ code: 'worktree-folder-not-deleted', worktreePath: '/w/a', gitFailure: EXITED },
    'git worktree remove /w/a exited with 128: fatal: locked The folder /w/a could not be deleted.'],
  [{ code: 'head-differs-after-success', commandArguments: ['merge', '--ff-only', 'abc'], headCommit: null },
    'git merge --ff-only abc exited 0, yet HEAD is unreadable.'],
  [{ code: 'leftover-not-a-checkout', path: '/w/g' }, 'The leftover folder /w/g is not a checkout of the repository.'],
  [{ code: 'checkout-of-another-branch', path: '/w/g', expectedBranch: 'group-a' }, 'The folder /w/g is a checkout of another branch than group-a.'],
  [{ code: 'refresh-merge-in-progress', path: '/w/r' }, 'The leftover refresh worktree /w/r holds a merge in progress.'],
  [{ code: 'refresh-changes-uncommitted', path: '/w/r' }, 'The leftover refresh worktree /w/r holds uncommitted changes.'],
  [{ code: 'refresh-not-detached', path: '/w/r', gitFailure: EXITED }, '/w/r: git worktree remove /w/a exited with 128: fatal: locked'],
];

describe('the sentence of each git problem', () => {
  test.each(SENTENCES.map(([problem, sentence]) => [problem.code, problem, sentence] as const))('%s', (_code, problem, sentence) => {
    expect(GitProblemWording.sentenceOf(problem)).toBe(sentence);
  });
});
