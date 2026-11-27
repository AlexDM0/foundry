/**
 * The git side of `worktree repair`: `recreate` saves the worktree's changes to the job folder's next `recreate-<n>.patch` before removing it, and
 * refuses when it could not save them; `unlock` removes a stale `index.lock` only; `prune` drops the record of a worktree folder that is gone. Git
 * answers from `src/testing/RecordedGit.ts`.
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync
} from 'node:fs';
import { join } from 'node:path';

import { afterEach, expect, test } from 'bun:test';


import { GIT_CALL_SHAPES, type RecordedGitStage, useRecordedGit } from '../../testing/RecordedGit.ts';
import { createScratchDirectory, removeScratchDirectory }         from '../../testing/ScratchWorkspace.ts';
import { describeWhenGitIsRecorded }                              from '../../testing/ToolGuard.ts';
import { WorktreeRepair, type WorktreeRepairRequest }             from './WorktreeRepair.ts';

const { playStage, takeUnansweredCalls } = useRecordedGit();

const WORKTREE_BRANCH = 'ticket-012';
const BINARY_DIFF = ['diff', '--binary', 'HEAD'];
const UNTRACKED_FILES = ['ls-files', '--others', '--exclude-standard', '-z'];
const COUPON_ADDITION = ['diff', '--binary', '--no-index', '--', '/dev/null', 'coupon.ts'];

let repository: string | null = null;

afterEach(() => {
  if (repository === null) return;
  removeScratchDirectory(`${repository}-worktrees`);
  removeScratchDirectory(repository);
  repository = null;
});

function repositoryWithWorktree(): { root: string; worktree: string; jobFolder: string } {
  const root = createScratchDirectory('worktree-repair');
  repository = root;
  const worktree = join(`${root}-worktrees`, WORKTREE_BRANCH);
  mkdirSync(worktree, { recursive: true });
  writeFileSync(join(worktree, 'basket.ts'), 'export const total = 1;\n');
  return { root, worktree, jobFolder: join(`${root}-worktrees`, 'jobs', 'J4') };
}

function removalOf(worktree: string): RecordedGitStage[number] {
  return { gitArguments: ['worktree', 'remove', '--force', worktree], answeredAs: GIT_CALL_SHAPES.WORKTREE_REMOVE_OF_A_LINKED, removesFolder: worktree };
}

function lockPathStep(root: string): RecordedGitStage[number] {
  return {
    gitArguments: ['rev-parse', '--git-path', 'index.lock'],
    answeredAs:   GIT_CALL_SHAPES.INDEX_LOCK_PATH_IN_A_WORKTREE,
    filledIn:     { '<repository>': root, '<branch>': WORKTREE_BRANCH },
  };
}

function lockPathOf(root: string): string {
  return join(root, '.git', 'worktrees', WORKTREE_BRANCH, 'index.lock');
}

function repairedIn(stage: RecordedGitStage, request: WorktreeRepairRequest): Promise<ReturnType<typeof WorktreeRepair.repair>> {
  return playStage(stage, () => Promise.resolve(WorktreeRepair.repair(request)));
}

describeWhenGitIsRecorded('recreate', () => {
  test('saves tracked and untracked changes to recreate-<n>.patch, numbered on, then removes the worktree', async () => {
    const { root, worktree, jobFolder } = repositoryWithWorktree();
    mkdirSync(jobFolder, { recursive: true });
    writeFileSync(join(jobFolder, 'recreate-1.patch'), 'an earlier save\n');
    writeFileSync(join(worktree, 'basket.ts'), 'export const total = 2;\n');
    writeFileSync(join(worktree, 'coupon.ts'), 'export const coupon = 3;\n');

    const repaired = await repairedIn([
      { gitArguments: BINARY_DIFF, answeredAs: GIT_CALL_SHAPES.BINARY_DIFF_OF_A_CHANGED_FILE },
      { gitArguments: UNTRACKED_FILES, answeredAs: GIT_CALL_SHAPES.ONE_UNTRACKED_FILE },
      { gitArguments: COUPON_ADDITION, answeredAs: GIT_CALL_SHAPES.ADDITION_OF_A_READABLE_FILE },
      removalOf(worktree),
    ], {
      repositoryRoot: root, worktreePath: worktree, step: 'recreate', jobFolder
    });

    expect(repaired).toEqual({ verdict: 'repaired', patchPath: join(jobFolder, 'recreate-2.patch') });
    const patch = readFileSync(join(jobFolder, 'recreate-2.patch'), 'utf8');
    expect(patch).toContain('+export const total = 2;');
    expect(patch).toContain('+export const coupon = 3;');
    expect(existsSync(worktree)).toBe(false);
  });

  test('a clean worktree is removed with no patch', async () => {
    const { root, worktree, jobFolder } = repositoryWithWorktree();
    expect(await repairedIn([
      { gitArguments: BINARY_DIFF, answeredAs: GIT_CALL_SHAPES.BINARY_DIFF_OF_AN_UNCHANGED_TREE },
      { gitArguments: UNTRACKED_FILES, answeredAs: GIT_CALL_SHAPES.NO_UNTRACKED_FILE },
      removalOf(worktree),
    ], {
      repositoryRoot: root, worktreePath: worktree, step: 'recreate', jobFolder
    })).toEqual({ verdict: 'repaired', patchPath: null });
    expect(existsSync(worktree)).toBe(false);
  });

  test('changes it cannot save keep the worktree: uncommitted-work-not-saved', async () => {
    const { root, worktree } = repositoryWithWorktree();
    writeFileSync(join(worktree, 'basket.ts'), 'export const total = 2;\n');

    expect(await repairedIn([
      { gitArguments: BINARY_DIFF, answeredAs: GIT_CALL_SHAPES.BINARY_DIFF_OF_A_CHANGED_FILE },
      { gitArguments: UNTRACKED_FILES, answeredAs: GIT_CALL_SHAPES.NO_UNTRACKED_FILE },
    ], {
      repositoryRoot: root, worktreePath: worktree, step: 'recreate', jobFolder: null
    })).toEqual({ verdict: 'uncommitted-work-not-saved' });
    expect(readFileSync(join(worktree, 'basket.ts'), 'utf8')).toBe('export const total = 2;\n');
  });

  test('an untracked file git cannot diff keeps the worktree: uncommitted-work-not-saved', async () => {
    const { root, worktree, jobFolder } = repositoryWithWorktree();
    writeFileSync(join(worktree, 'coupon.ts'), 'export const coupon = 3;\n');

    const repaired = await repairedIn([
      { gitArguments: BINARY_DIFF, answeredAs: GIT_CALL_SHAPES.BINARY_DIFF_OF_AN_UNCHANGED_TREE },
      { gitArguments: UNTRACKED_FILES, answeredAs: GIT_CALL_SHAPES.ONE_UNTRACKED_FILE },
      { gitArguments: COUPON_ADDITION, answeredAs: GIT_CALL_SHAPES.ADDITION_OF_AN_UNREADABLE_FILE },
    ], {
      repositoryRoot: root, worktreePath: worktree, step: 'recreate', jobFolder
    });

    expect(repaired).toEqual({ verdict: 'uncommitted-work-not-saved' });
    expect(readFileSync(join(worktree, 'coupon.ts'), 'utf8')).toBe('export const coupon = 3;\n');
  });
});

describeWhenGitIsRecorded('unlock and prune', () => {
  test('unlock removes the worktree\'s stale index.lock and leaves its changes', async () => {
    const { root, worktree } = repositoryWithWorktree();
    writeFileSync(join(worktree, 'basket.ts'), 'export const total = 2;\n');
    const lockPath = lockPathOf(root);
    mkdirSync(join(lockPath, '..'), { recursive: true });
    writeFileSync(lockPath, '');

    expect(await repairedIn([lockPathStep(root)], {
      repositoryRoot: root, worktreePath: worktree, step: 'unlock', jobFolder: null
    })).toEqual({ verdict: 'repaired', patchPath: null });
    expect(existsSync(lockPath)).toBe(false);
    expect(readFileSync(join(worktree, 'basket.ts'), 'utf8')).toBe('export const total = 2;\n');
  });

  test('unlock reports a lock it cannot remove as git-failed, a folder standing in for a lock Windows holds open', async () => {
    const { root, worktree } = repositoryWithWorktree();
    const lockPath = lockPathOf(root);
    mkdirSync(join(lockPath, 'held'), { recursive: true });

    const repaired = await repairedIn([lockPathStep(root)], {
      repositoryRoot: root, worktreePath: worktree, step: 'unlock', jobFolder: null
    });

    expect(repaired.verdict).toBe('git-failed');
    expect(existsSync(lockPath)).toBe(true);
  });

  test('prune asks git to drop the record of a worktree whose folder is gone', async () => {
    const { root, worktree } = repositoryWithWorktree();
    removeScratchDirectory(`${root}-worktrees`);

    expect(await repairedIn([{ gitArguments: ['worktree', 'prune'], answeredAs: GIT_CALL_SHAPES.WORKTREE_PRUNE_OF_A_GONE_WORKTREE }], {
      repositoryRoot: root, worktreePath: worktree, step: 'prune', jobFolder: null
    })).toEqual({ verdict: 'repaired', patchPath: null });
  });

  test('a git call the stage holds no answer for fails the case', async () => {
    const { root, worktree } = repositoryWithWorktree();

    await expect(repairedIn([], {
      repositoryRoot: root, worktreePath: worktree, step: 'prune', jobFolder: null
    })).rejects.toThrow('git worktree prune');
    expect(takeUnansweredCalls()).toEqual([`git worktree prune in ${root} has no recorded answer: the stage expected no call`]);
  });
});
