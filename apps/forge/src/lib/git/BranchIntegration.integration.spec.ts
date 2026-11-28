/**
 * Every refusal git gives comes back as a verdict with git's own reason, a worktree holding work is left standing with that work named,
 * and an option-shaped branch name reads as a ref under refs/heads/. A fast-forward stopped by a held file (Windows only, so faked) is told
 * apart from the owner's changes: what git half wrote goes back to HEAD, and a path the owner changed is never touched.
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync
} from 'node:fs';
import { join }                   from 'node:path';
import { afterAll, expect, test } from 'bun:test';

import { heldFileGit }                from '../../testing/HeldFileGit.ts';
import {
  addWorktree,
  commitFile,
  createScratchDirectory,
  createScratchGitRepository,
  currentBranchOf,
  gitOutputIn,
  removeScratchDirectory,
  SCRATCH_COMMIT_IDENTITY_ARGUMENTS
} from '../../testing/ScratchWorkspace.ts';
import { describeWhenGitIsPresent } from '../../testing/ToolGuard.ts';
import {
  deleteMergedBranch,
  fastForwardTo,
  readBranchDescent,
  readCurrentBranch,
  readWorktreeCheckout,
  removeWorktree
} from './BranchIntegration.ts';
import { HELD_CHECKOUT_RETRY_TRIES } from './HeldCheckout.ts';

const scratchDirectories: string[] = [];

function scratchGitRepository(prefix: string): string {
  const repositoryDirectory = createScratchGitRepository(prefix);
  scratchDirectories.push(repositoryDirectory, `${repositoryDirectory}-worktrees`);
  return repositoryDirectory;
}

function scratchDirectory(prefix: string): string {
  const directory = createScratchDirectory(prefix);
  scratchDirectories.push(directory);
  return directory;
}

afterAll(() => {
  for (const directory of scratchDirectories) removeScratchDirectory(directory);
});

describeWhenGitIsPresent('the branch the main checkout is on', () => {
  test('a checkout on a branch reads on-branch with that branch\'s name', () => {
    const repositoryDirectory = scratchGitRepository('branch-integration-on-branch');
    expect(readCurrentBranch(repositoryDirectory)).toEqual({ verdict: 'on-branch', branch: currentBranchOf(repositoryDirectory) });
  });

  test('a detached HEAD reads detached, not as a git failure', () => {
    const repositoryDirectory = scratchGitRepository('branch-integration-detached');
    gitOutputIn(repositoryDirectory, ['checkout', '-q', '--detach']);
    expect(readCurrentBranch(repositoryDirectory)).toEqual({ verdict: 'detached' });
  });

  test('a directory outside any repository reads git-failed with git\'s own exit code and reason', () => {
    const plainDirectory = scratchDirectory('branch-integration-no-repository');
    const reading        = readCurrentBranch(plainDirectory);
    expect(reading.verdict).toBe('git-failed');
    if (reading.verdict !== 'git-failed') return;
    expect(reading.problem).toMatchObject({ code: 'git-exited', gitArguments: ['symbolic-ref', '--quiet', '--short', 'HEAD'], exitCode: 128 });
  });
});

describeWhenGitIsPresent('whether a branch descends from the main line', () => {
  test('a branch built on the main line\'s tip is a descendant, with both commits named', () => {
    const repositoryDirectory = scratchGitRepository('branch-integration-descendant');
    const mainLine            = currentBranchOf(repositoryDirectory);
    const mainLineCommit      = gitOutputIn(repositoryDirectory, ['rev-parse', 'HEAD']);
    gitOutputIn(repositoryDirectory, ['checkout', '-q', '-b', 'feature']);
    const branchCommit = commitFile(repositoryDirectory, 'feature.txt', 'feature\n');

    expect(readBranchDescent(repositoryDirectory, 'feature', mainLine)).toEqual({ verdict: 'descendant', branchCommit, mainLineCommit });
  });

  test('a branch missing a commit the main line gained is not a descendant', () => {
    const repositoryDirectory = scratchGitRepository('branch-integration-not-descendant');
    const mainLine            = currentBranchOf(repositoryDirectory);
    gitOutputIn(repositoryDirectory, ['checkout', '-q', '-b', 'feature']);
    const branchCommit = commitFile(repositoryDirectory, 'feature.txt', 'feature\n');
    gitOutputIn(repositoryDirectory, ['checkout', '-q', mainLine]);
    const mainLineCommit = commitFile(repositoryDirectory, 'main.txt', 'main\n');

    expect(readBranchDescent(repositoryDirectory, 'feature', mainLine)).toEqual({ verdict: 'not-a-descendant', branchCommit, mainLineCommit });
  });

  test('a branch that does not exist reads unknown-branch', () => {
    const repositoryDirectory = scratchGitRepository('branch-integration-unknown-branch');
    expect(readBranchDescent(repositoryDirectory, 'no-such-branch', currentBranchOf(repositoryDirectory))).toEqual({ verdict: 'unknown-branch' });
  });

  test('a main line that does not exist reads unknown-main-line', () => {
    const repositoryDirectory = scratchGitRepository('branch-integration-unknown-main-line');
    gitOutputIn(repositoryDirectory, ['branch', 'feature']);
    expect(readBranchDescent(repositoryDirectory, 'feature', 'no-such-main-line')).toEqual({ verdict: 'unknown-main-line' });
  });

  // A branch name comes from a caller; it is read under refs/heads/, so an option-shaped one is only ever a ref name.
  test('a branch named like an option that does not exist reads unknown-branch and writes no file', () => {
    const repositoryDirectory = scratchGitRepository('branch-integration-option-branch');
    expect(readBranchDescent(repositoryDirectory, '--output=x', currentBranchOf(repositoryDirectory))).toEqual({ verdict: 'unknown-branch' });
    expect(existsSync(join(repositoryDirectory, 'x'))).toBe(false);
  });

  test('a branch named like an option that does exist is read as that branch', () => {
    const repositoryDirectory = scratchGitRepository('branch-integration-option-branch-present');
    const mainLine            = currentBranchOf(repositoryDirectory);
    const mainLineCommit      = gitOutputIn(repositoryDirectory, ['rev-parse', 'HEAD']);
    gitOutputIn(repositoryDirectory, ['update-ref', 'refs/heads/--output=x', mainLineCommit]);

    expect(readBranchDescent(repositoryDirectory, '--output=x', mainLine)).toEqual({ verdict: 'descendant', branchCommit: mainLineCommit, mainLineCommit });
    expect(existsSync(join(repositoryDirectory, 'x'))).toBe(false);
  });
});

describeWhenGitIsPresent('the fast-forward', () => {
  test('a commit ahead of the main line is fast-forwarded to and left at HEAD', () => {
    const repositoryDirectory = scratchGitRepository('branch-integration-fast-forward');
    const mainLine            = currentBranchOf(repositoryDirectory);
    gitOutputIn(repositoryDirectory, ['checkout', '-q', '-b', 'feature']);
    const branchCommit = commitFile(repositoryDirectory, 'feature.txt', 'feature\n');
    gitOutputIn(repositoryDirectory, ['checkout', '-q', mainLine]);

    expect(fastForwardTo(repositoryDirectory, branchCommit)).toEqual({ verdict: 'fast-forwarded', commit: branchCommit });
    expect(gitOutputIn(repositoryDirectory, ['rev-parse', 'HEAD'])).toBe(branchCommit);
  });

  test('a main line that has diverged is refused with git\'s reason, and HEAD stays where it was', () => {
    const repositoryDirectory = scratchGitRepository('branch-integration-diverged');
    const mainLine            = currentBranchOf(repositoryDirectory);
    gitOutputIn(repositoryDirectory, ['checkout', '-q', '-b', 'feature']);
    const branchCommit = commitFile(repositoryDirectory, 'feature.txt', 'feature\n');
    gitOutputIn(repositoryDirectory, ['checkout', '-q', mainLine]);
    const mainLineCommit = commitFile(repositoryDirectory, 'main.txt', 'main\n');

    const outcome = fastForwardTo(repositoryDirectory, branchCommit);
    expect(outcome.verdict).toBe('refused');
    if (outcome.verdict !== 'refused') return;
    expect(outcome.problem).toMatchObject({ code: 'git-exited', gitArguments: ['merge', '--ff-only', '--quiet', branchCommit] });
    expect(outcome.blockingFiles).toEqual([]);
    expect(gitOutputIn(repositoryDirectory, ['rev-parse', 'HEAD'])).toBe(mainLineCommit);
  });

  test('a refusal over uncommitted work names the changed and untracked files the merge would overwrite, and no other uncommitted file', () => {
    const repositoryDirectory = scratchGitRepository('branch-integration-blocking-files');
    const mainLine            = currentBranchOf(repositoryDirectory);
    commitFile(repositoryDirectory, 'shared.md', 'shared\n');
    commitFile(repositoryDirectory, 'untouched.md', 'untouched\n');
    gitOutputIn(repositoryDirectory, ['checkout', '-q', '-b', 'feature']);
    commitFile(repositoryDirectory, 'shared.md', 'feature\n');
    const branchCommit = commitFile(repositoryDirectory, 'new file.md', 'feature\n');
    gitOutputIn(repositoryDirectory, ['checkout', '-q', mainLine]);
    const mainLineCommit = gitOutputIn(repositoryDirectory, ['rev-parse', 'HEAD']);
    writeFileSync(join(repositoryDirectory, 'shared.md'), 'edited by hand\n');
    writeFileSync(join(repositoryDirectory, 'new file.md'), 'left untracked\n');
    writeFileSync(join(repositoryDirectory, 'untouched.md'), 'edited by hand\n');

    const outcome = fastForwardTo(repositoryDirectory, branchCommit);
    expect(outcome.verdict).toBe('refused');
    if (outcome.verdict !== 'refused') return;
    expect(outcome.blockingFiles.toSorted()).toEqual(['new file.md', 'shared.md']);
    expect(gitOutputIn(repositoryDirectory, ['rev-parse', 'HEAD'])).toBe(mainLineCommit);
    expect(readFileSync(join(repositoryDirectory, 'shared.md'), 'utf8')).toBe('edited by hand\n');
    expect(readFileSync(join(repositoryDirectory, 'new file.md'), 'utf8')).toBe('left untracked\n');
  });

  // Rename detection would report only the new path, while git refuses over the old one the merge removes.
  test('a refusal over a file the branch renames names the path it was renamed from', () => {
    const repositoryDirectory = scratchGitRepository('branch-integration-renamed-blocking-file');
    const mainLine            = currentBranchOf(repositoryDirectory);
    commitFile(repositoryDirectory, 'before.md', 'one\ntwo\nthree\nfour\n');
    gitOutputIn(repositoryDirectory, ['checkout', '-q', '-b', 'feature']);
    gitOutputIn(repositoryDirectory, ['mv', 'before.md', 'after.md']);
    gitOutputIn(repositoryDirectory, [...SCRATCH_COMMIT_IDENTITY_ARGUMENTS, 'commit', '-q', '-m', 'Rename the file']);
    const branchCommit = gitOutputIn(repositoryDirectory, ['rev-parse', 'HEAD']);
    gitOutputIn(repositoryDirectory, ['checkout', '-q', mainLine]);
    writeFileSync(join(repositoryDirectory, 'before.md'), 'edited by hand\n');

    const outcome = fastForwardTo(repositoryDirectory, branchCommit);
    expect(outcome.verdict).toBe('refused');
    if (outcome.verdict !== 'refused') return;
    expect(outcome.blockingFiles).toEqual(['before.md']);
  });
});

describeWhenGitIsPresent('a fast-forward stopped by a held file', () => {
  /** The branch changes `held.md` and `written.md` and adds `added.md`; the fake git writes the last two before it fails on `held.md`. */
  function repositoryWithHeldFile(prefix: string): { repositoryDirectory: string; branchCommit: string; mainLineCommit: string; writeTheTargetFiles: () => void } {
    const repositoryDirectory = scratchGitRepository(prefix);
    const mainLine            = currentBranchOf(repositoryDirectory);
    commitFile(repositoryDirectory, 'held.md', 'held before\n');
    commitFile(repositoryDirectory, 'written.md', 'written before\n');
    commitFile(repositoryDirectory, 'owned.md', 'owned before\n');
    const mainLineCommit = gitOutputIn(repositoryDirectory, ['rev-parse', 'HEAD']);
    gitOutputIn(repositoryDirectory, ['checkout', '-q', '-b', 'feature']);
    commitFile(repositoryDirectory, 'held.md', 'held after\n');
    commitFile(repositoryDirectory, 'written.md', 'written after\n');
    commitFile(repositoryDirectory, 'owned.md', 'owned after\n');
    const branchCommit = commitFile(repositoryDirectory, 'added.md', 'added after\n');
    gitOutputIn(repositoryDirectory, ['checkout', '-q', mainLine]);
    const writeTheTargetFiles = (): void => {
      writeFileSync(join(repositoryDirectory, 'written.md'), 'written after\n');
      writeFileSync(join(repositoryDirectory, 'added.md'), 'added after\n');
    };
    return {
      repositoryDirectory, branchCommit, mainLineCommit, writeTheTargetFiles
    };
  }

  test('a held file on every try is refused target-file-held naming it, and the files git wrote are put back to HEAD', () => {
    const {
      repositoryDirectory, branchCommit, mainLineCommit, writeTheTargetFiles
    } = repositoryWithHeldFile('branch-integration-held-file');
    const git = heldFileGit('held.md', HELD_CHECKOUT_RETRY_TRIES, writeTheTargetFiles);

    const outcome = fastForwardTo(repositoryDirectory, branchCommit, 'hooks-off', git);

    expect(outcome).toMatchObject({ verdict: 'target-file-held', heldFiles: ['held.md'] });
    expect(outcome).not.toHaveProperty('blockingFiles');
    expect(git.pauses).toBe(HELD_CHECKOUT_RETRY_TRIES - 1);
    expect(gitOutputIn(repositoryDirectory, ['rev-parse', 'HEAD'])).toBe(mainLineCommit);
    expect(gitOutputIn(repositoryDirectory, ['status', '--porcelain', '--untracked-files=all'])).toBe('');
  });

  test('a held file released before the next try lands on the retry', () => {
    const { repositoryDirectory, branchCommit, writeTheTargetFiles } = repositoryWithHeldFile('branch-integration-held-then-released');
    const git = heldFileGit('held.md', 1, writeTheTargetFiles);

    expect(fastForwardTo(repositoryDirectory, branchCommit, 'hooks-off', git)).toEqual({ verdict: 'fast-forwarded', commit: branchCommit });
    expect(git.pauses).toBe(1);
  });

  test('the owner\'s uncommitted change in a changed path is never put back, even when it already holds the target\'s content', () => {
    const { repositoryDirectory, branchCommit, writeTheTargetFiles } = repositoryWithHeldFile('branch-integration-held-owner-change');
    writeFileSync(join(repositoryDirectory, 'owned.md'), 'owned after\n');
    const git = heldFileGit('held.md', HELD_CHECKOUT_RETRY_TRIES, writeTheTargetFiles);

    expect(fastForwardTo(repositoryDirectory, branchCommit, 'hooks-off', git)).toMatchObject({ verdict: 'target-file-held', heldFiles: ['held.md'] });
    expect(readFileSync(join(repositoryDirectory, 'owned.md'), 'utf8')).toBe('owned after\n');
    expect(gitOutputIn(repositoryDirectory, ['status', '--porcelain', '--untracked-files=all'])).toBe('M owned.md');
  });

  test('a file git did not write, holding neither side\'s content, is left as it is', () => {
    const { repositoryDirectory, branchCommit } = repositoryWithHeldFile('branch-integration-held-foreign-content');
    const git = heldFileGit('held.md', HELD_CHECKOUT_RETRY_TRIES, () => {
      writeFileSync(join(repositoryDirectory, 'written.md'), 'written by another program\n');
    });

    expect(fastForwardTo(repositoryDirectory, branchCommit, 'hooks-off', git).verdict).toBe('target-file-held');
    expect(readFileSync(join(repositoryDirectory, 'written.md'), 'utf8')).toBe('written by another program\n');
    expect(existsSync(join(repositoryDirectory, 'added.md'))).toBe(false);
  });

  test('a failure that names no held file is refused as before, with the blocking files read before the merge', () => {
    const { repositoryDirectory, branchCommit } = repositoryWithHeldFile('branch-integration-other-failure');
    writeFileSync(join(repositoryDirectory, 'owned.md'), 'edited by hand\n');
    const git = heldFileGit('held.md', 0);

    expect(fastForwardTo(repositoryDirectory, branchCommit, 'hooks-off', git)).toMatchObject({ verdict: 'refused', blockingFiles: ['owned.md'] });
    expect(git.pauses).toBe(0);
  });
});

describeWhenGitIsPresent('removing the worktree', () => {
  test('a clean worktree is removed', () => {
    const repositoryDirectory = scratchGitRepository('branch-integration-clean-worktree');
    const worktreeDirectory   = addWorktree(repositoryDirectory, 'subagent');

    expect(removeWorktree(repositoryDirectory, worktreeDirectory)).toEqual({ verdict: 'removed' });
    expect(existsSync(worktreeDirectory)).toBe(false);
  });

  // Never forced: the files git would lose are named, unquoted, so a person can decide what to keep.
  test('a worktree holding an untracked file and a changed one is left standing, with both named', () => {
    const repositoryDirectory = scratchGitRepository('branch-integration-dirty-worktree');
    gitOutputIn(repositoryDirectory, ['config', 'core.quotePath', 'true']);
    commitFile(repositoryDirectory, 'tracked.txt', 'original\n');
    const worktreeDirectory = addWorktree(repositoryDirectory, 'subagent');
    writeFileSync(join(worktreeDirectory, 'tracked.txt'), 'changed\n');
    writeFileSync(join(worktreeDirectory, 'café.txt'), 'untracked\n');

    const outcome = removeWorktree(repositoryDirectory, worktreeDirectory);
    expect(outcome.verdict).toBe('left');
    if (outcome.verdict !== 'left') return;
    expect(outcome.problem).toMatchObject({ code: 'git-exited', gitArguments: ['worktree', 'remove', worktreeDirectory] });
    expect(outcome.filesLeft).toEqual({ untrackedFiles: ['café.txt'], changedFiles: ['tracked.txt'] });
    expect(existsSync(worktreeDirectory)).toBe(true);
  });
});

describeWhenGitIsPresent('reading the commit a worktree stands at', () => {
  test('a clean worktree reads its HEAD commit and nothing beside it', () => {
    const repositoryDirectory = scratchGitRepository('branch-integration-clean-checkout');
    const worktreeDirectory   = addWorktree(repositoryDirectory, 'subagent');
    const tip                 = commitFile(worktreeDirectory, 'built.ts', 'export const built = true;\n');

    expect(readWorktreeCheckout(worktreeDirectory)).toEqual({ verdict: 'read', headCommit: tip, filesBeside: { untrackedFiles: [], changedFiles: [] } });
  });

  test('a changed file and an untracked one are named, and an ignored one is not', () => {
    const repositoryDirectory = scratchGitRepository('branch-integration-dirty-checkout');
    commitFile(repositoryDirectory, '.gitignore', 'build/\n');
    commitFile(repositoryDirectory, 'tracked.txt', 'original\n');
    const worktreeDirectory = addWorktree(repositoryDirectory, 'subagent');
    writeFileSync(join(worktreeDirectory, 'tracked.txt'), 'changed\n');
    writeFileSync(join(worktreeDirectory, 'probe.ts'), 'untracked\n');
    mkdirSync(join(worktreeDirectory, 'build'));
    writeFileSync(join(worktreeDirectory, 'build', 'output.js'), 'ignored\n');

    const reading = readWorktreeCheckout(worktreeDirectory);
    expect(reading.verdict === 'read' ? reading.filesBeside : null).toEqual({ untrackedFiles: ['probe.ts'], changedFiles: ['tracked.txt'] });
  });

  test('a path that is no directory reads not-a-directory, and a directory outside any repository git-failed', () => {
    expect(readWorktreeCheckout(join(scratchDirectory('branch-integration-no-checkout'), 'missing'))).toEqual({ verdict: 'not-a-directory' });
    const reading = readWorktreeCheckout(scratchDirectory('branch-integration-outside'));
    expect(reading.verdict).toBe('git-failed');
  });
});

describeWhenGitIsPresent('deleting the merged branch', () => {
  test('a branch the main checkout\'s HEAD holds is deleted', () => {
    const repositoryDirectory = scratchGitRepository('branch-integration-merged-branch');
    gitOutputIn(repositoryDirectory, ['branch', 'merged-work']);

    expect(deleteMergedBranch(repositoryDirectory, 'merged-work')).toEqual({ verdict: 'deleted' });
    expect(gitOutputIn(repositoryDirectory, ['branch', '--list', 'merged-work'])).toBe('');
  });

  test('a branch holding unmerged work is left, with git\'s reason', () => {
    const repositoryDirectory = scratchGitRepository('branch-integration-unmerged-branch');
    const mainLine            = currentBranchOf(repositoryDirectory);
    gitOutputIn(repositoryDirectory, ['checkout', '-q', '-b', 'unmerged-work']);
    commitFile(repositoryDirectory, 'feature.txt', 'feature\n');
    gitOutputIn(repositoryDirectory, ['checkout', '-q', mainLine]);

    const outcome = deleteMergedBranch(repositoryDirectory, 'unmerged-work');
    expect(outcome.verdict).toBe('left');
    if (outcome.verdict !== 'left') return;
    expect(outcome.problem).toMatchObject({ code: 'git-exited', gitArguments: ['branch', '-d', 'unmerged-work'] });
    expect(gitOutputIn(repositoryDirectory, ['branch', '--list', 'unmerged-work'])).not.toBe('');
  });
});
