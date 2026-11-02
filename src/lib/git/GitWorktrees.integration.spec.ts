/**
 * Worktree readiness and removal on a scratch repository whose worktrees folder lies inside the checkout, as the tool lays it out. What
 * matters: a remnant folder there never reads as the checkout above it, under the ceiling or through the readiness check; a removal that a
 * held working directory declines succeeds once the holder is gone, within the bounded tries; a worktree git declines for files it would
 * lose still stands and never reaches the hand deletion; and a remnant git no longer knows is deleted.
 */
import {
  existsSync,
  mkdirSync,
  rmSync,
  writeFileSync
} from 'node:fs';
import { join } from 'node:path';

import { afterEach, expect, test } from 'bun:test';

import {
  commitFile,
  createScratchGitRepository,
  gitOutputIn,
  removeScratchDirectory
}                                   from '../../testing/ScratchWorkspace.ts';
import { describeWhenGitIsPresent } from '../../testing/ToolGuard.ts';
import { GitProcess }               from './GitProcess.ts';
import {
  GitWorktrees,
  REAL_WORKTREE_REMOVAL_PRIMITIVES,
  WORKTREE_REMOVAL_TRIES,
  type WorktreeRemovalPrimitives
} from './GitWorktrees.ts';

let repository: string | null = null;

afterEach(() => {
  if (repository === null) return;
  removeScratchDirectory(repository);
  repository = null;
});

function repositoryWithWorktreesFolder(): { root: string; worktreesFolder: string } {
  const root = createScratchGitRepository('git-worktrees');
  repository = root;
  gitOutputIn(root, ['checkout', '-q', '-B', 'main']);
  commitFile(root, 'basket.ts', 'export const total = 1;\n');
  const worktreesFolder = join(root, '.claude', 'worktrees');
  mkdirSync(worktreesFolder, { recursive: true });
  return { root, worktreesFolder };
}

function addedWorktree(root: string, worktreesFolder: string): string {
  const worktree = join(worktreesFolder, 'ticket-7');
  gitOutputIn(root, ['worktree', 'add', '-q', '-b', 'ticket-7', worktree, 'main']);
  return worktree;
}

/** No waiting in a spec: a pause only counts, and a hand deletion is recorded before it runs. */
function countingPrimitives(overrides: Partial<WorktreeRemovalPrimitives> = {}): WorktreeRemovalPrimitives & { pauses: number; deletedFolders: string[] } {
  const primitives = {
    ...REAL_WORKTREE_REMOVAL_PRIMITIVES,
    pauses:         0,
    deletedFolders: [] as string[],
    pause:          () => { primitives.pauses += 1; },
    deleteFolder:   (path: string) => {
      primitives.deletedFolders.push(path);
      REAL_WORKTREE_REMOVAL_PRIMITIVES.deleteFolder(path);
    },
    ...overrides,
  };
  return primitives;
}

describeWhenGitIsPresent('a remnant folder inside the worktrees folder', () => {
  test('resolves to the checkout above it without a ceiling, the walk the ceiling stops', () => {
    const { root, worktreesFolder } = repositoryWithWorktreesFolder();
    const remnant = join(worktreesFolder, 'ticket-7');
    mkdirSync(remnant);

    const unbounded = GitProcess.run(remnant, ['rev-parse', '--show-toplevel']);
    expect(GitProcess.succeeded(unbounded)).toBe(true);
    expect(unbounded?.standardOutput.trim()).toBe(gitOutputIn(root, ['rev-parse', '--show-toplevel']));
  });

  test('answers not a git repository under the ceiling, and reads as a leftover, never a checkout', () => {
    const { root, worktreesFolder } = repositoryWithWorktreesFolder();
    const remnant = join(worktreesFolder, 'ticket-7');
    mkdirSync(remnant);

    const bounded = GitProcess.run(remnant, ['rev-parse', '--show-toplevel'], 'hooks-off', undefined, GitWorktrees.ceilingOf(remnant));
    expect(GitProcess.succeeded(bounded)).toBe(false);
    expect(bounded?.standardError).toContain('not a git repository');
    expect(GitWorktrees.worktreeStateOf(root, remnant)).toBe('leftover');
    expect(GitWorktrees.worktreeIsCheckoutOf(root, remnant)).toBe(false);
  });

  test('a worktree whose .git went first reads as a leftover too', () => {
    const { root, worktreesFolder } = repositoryWithWorktreesFolder();
    const worktree = addedWorktree(root, worktreesFolder);
    expect(GitWorktrees.worktreeStateOf(root, worktree)).toBe('checkout');
    rmSync(join(worktree, '.git'));

    expect(GitWorktrees.worktreeStateOf(root, worktree)).toBe('leftover');
    expect(GitWorktrees.worktreeStateOf(root, join(worktreesFolder, 'ticket-8'))).toBe('absent');
  });
});

describeWhenGitIsPresent('removeWithRetry', () => {
  test('a removal declined while a process holds the tree succeeds once the tree reads empty, within the bounded tries', () => {
    const { root, worktreesFolder } = repositoryWithWorktreesFolder();
    const worktree = addedWorktree(root, worktreesFolder);
    const pausesTheHolderOutlives = 3;
    let removalTries = 0;
    const primitives = countingPrimitives();
    primitives.runGit = (directory, gitArguments, ...rest) => {
      if (gitArguments[1] !== 'remove') return GitProcess.run(directory, gitArguments, ...rest);
      removalTries += 1;
      const treeIsEmpty = primitives.pauses >= pausesTheHolderOutlives;
      return treeIsEmpty ? GitProcess.run(directory, gitArguments, ...rest) : { exitCode: 255, standardOutput: '', standardError: 'Permission denied' };
    };

    expect(GitWorktrees.removeWithRetry({ repositoryDirectory: root, worktreePath: worktree, force: 'never-force' }, primitives)).toEqual({ verdict: 'removed' });
    expect(removalTries).toBe(pausesTheHolderOutlives + 1);
    expect(removalTries).toBeLessThanOrEqual(WORKTREE_REMOVAL_TRIES);
    expect(existsSync(worktree)).toBe(false);
    expect(primitives.deletedFolders).toEqual([]);
  });

  test('a worktree git declines for uncommitted files still stands, and the hand deletion is never reached', () => {
    const { root, worktreesFolder } = repositoryWithWorktreesFolder();
    const worktree = addedWorktree(root, worktreesFolder);
    writeFileSync(join(worktree, 'coupon.ts'), 'export const coupon = 3;\n');
    const primitives = countingPrimitives();

    const removal = GitWorktrees.removeWithRetry({ repositoryDirectory: root, worktreePath: worktree, force: 'never-force' }, primitives);

    expect(removal.verdict).toBe('left');
    expect(primitives.pauses).toBe(WORKTREE_REMOVAL_TRIES - 1);
    expect(primitives.deletedFolders).toEqual([]);
    expect(existsSync(join(worktree, 'coupon.ts'))).toBe(true);
    expect(GitWorktrees.worktreeIsCheckoutOf(root, worktree)).toBe(true);
  });

  test('a remnant git no longer knows is pruned and deleted by hand', () => {
    const { root, worktreesFolder } = repositoryWithWorktreesFolder();
    const worktree = addedWorktree(root, worktreesFolder);
    rmSync(join(worktree, '.git'));
    const primitives = countingPrimitives();

    expect(GitWorktrees.removeWithRetry({ repositoryDirectory: root, worktreePath: worktree, force: 'never-force' }, primitives)).toEqual({ verdict: 'removed' });
    expect(primitives.deletedFolders).toEqual([worktree]);
    expect(gitOutputIn(root, ['worktree', 'list'])).not.toContain('ticket-7');
  });

  test('a folder that is already gone reads as removed, its stale record pruned', () => {
    const { root, worktreesFolder } = repositoryWithWorktreesFolder();
    const worktree = addedWorktree(root, worktreesFolder);
    rmSync(worktree, { recursive: true, force: true });

    expect(GitWorktrees.removeWithRetry({ repositoryDirectory: root, worktreePath: worktree, force: 'never-force' }, countingPrimitives())).toEqual({ verdict: 'removed' });
    expect(gitOutputIn(root, ['worktree', 'list'])).not.toContain('ticket-7');
  });
});
