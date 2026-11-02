/**
 * Whether a folder is a checkout of a repository, judged by git and never by the folder's presence, and the one removal of a linked
 * worktree. A process that holds a folder as its working directory makes a removal fail on Windows, so the removal tries again for a bounded
 * time, and deletes by hand only a folder that git no longer reads as any repository.
 */
import { existsSync, realpathSync, rmSync } from 'node:fs';
import { dirname, join, resolve }           from 'node:path';

import { GitProcess } from './GitProcess.ts';

export const WORKTREE_REMOVAL_TRIES = 5;

export const WORKTREE_REMOVAL_STEP_MILLISECONDS = 200;

/** `force` also removes what git would lose; `never-force` leaves a worktree holding such files standing. */
export type WorktreeRemovalForce = 'never-force' | 'force';

export interface WorktreeRemovalRequest {
  repositoryDirectory: string;
  worktreePath:        string;
  force:               WorktreeRemovalForce;
}

export type WorktreeRemovalVerdict = { verdict: 'removed' } | { verdict: 'left'; reason: string };

/** `checkout` is a worktree of the repository; `leftover` is a folder on disk that is not one, and is never reused. */
export type WorktreeState = 'checkout' | 'leftover' | 'absent';

export interface WorktreeRemovalPrimitives {
  runGit:       typeof GitProcess.run;
  pause:        (milliseconds: number) => void;
  deleteFolder: (path: string) => void;
}

export const REAL_WORKTREE_REMOVAL_PRIMITIVES: WorktreeRemovalPrimitives = Object.freeze({
  runGit:       GitProcess.run,
  pause:        (milliseconds: number) => Bun.sleepSync(milliseconds),
  deleteFolder: (path: string) => rmSync(path, {
    recursive: true, force: true, maxRetries: WORKTREE_REMOVAL_TRIES, retryDelay: WORKTREE_REMOVAL_STEP_MILLISECONDS
  }),
});

/** The ceiling for git run at the top of a worktree: its parent folder, so git reads the worktree's own `.git` and never a checkout above it. */
function ceilingOf(worktreePath: string): string {
  return dirname(resolve(worktreePath));
}

function realPathOrNull(path: string): string | null {
  try {
    return realpathSync.native(path);
  } catch {
    return null;
  }
}

function printedPathsOf(
  directory: string, gitArguments: readonly string[], ceilingDirectory?: string, runGit: typeof GitProcess.run = GitProcess.run
): string[] | null {
  const run = runGit(directory, ['rev-parse', '--path-format=absolute', ...gitArguments], 'hooks-off', undefined, ceilingDirectory);
  if (!GitProcess.succeeded(run)) return null;
  return run.standardOutput.split('\n').filter((line) => line !== '').map(realPathOrNull).filter((path) => path !== null);
}

/** `null` when git, held below the folder's parent, reads no repository there; otherwise the folder's top level and its common git folder. */
function repositoryReadingOf(worktreePath: string, runGit: typeof GitProcess.run = GitProcess.run): { topLevel: string; commonFolder: string } | null {
  const paths = printedPathsOf(worktreePath, ['--show-toplevel', '--git-common-dir'], ceilingOf(worktreePath), runGit);
  const [topLevel, commonFolder] = paths ?? [];
  return topLevel === undefined || commonFolder === undefined ? null : { topLevel, commonFolder };
}

function worktreeStateOf(repositoryDirectory: string, worktreePath: string): WorktreeState {
  if (!existsSync(worktreePath)) return 'absent';
  const reading            = repositoryReadingOf(worktreePath);
  const [repositoryCommon] = printedPathsOf(repositoryDirectory, ['--git-common-dir']) ?? [];
  if (reading === null || repositoryCommon === undefined) return 'leftover';
  const isTopLevel = reading.topLevel === realPathOrNull(worktreePath);
  return isTopLevel && reading.commonFolder === repositoryCommon ? 'checkout' : 'leftover';
}

function worktreeIsCheckoutOf(repositoryDirectory: string, worktreePath: string): boolean {
  return worktreeStateOf(repositoryDirectory, worktreePath) === 'checkout';
}

/**
 * git declined every try, so the stale records are pruned, and only a folder that git reads as no repository at all is deleted by hand. A
 * worktree git declined for files it would lose still has its `.git`, so it stays.
 */
function deleteWhatGitNoLongerKnows(request: WorktreeRemovalRequest, primitives: WorktreeRemovalPrimitives, reason: string): WorktreeRemovalVerdict {
  const prune = primitives.runGit(request.repositoryDirectory, ['worktree', 'prune']);
  if (!existsSync(request.worktreePath)) return { verdict: 'removed' };
  // A git that did not run, or a `.git` git cannot read, proves nothing gone: the folder may still hold work.
  if (!GitProcess.succeeded(prune) || existsSync(join(request.worktreePath, '.git'))) return { verdict: 'left', reason };
  if (repositoryReadingOf(request.worktreePath, primitives.runGit) !== null) return { verdict: 'left', reason };
  try {
    primitives.deleteFolder(request.worktreePath);
  } catch {
    // Judged below: the folder that is still there is the leftover.
  }
  return existsSync(request.worktreePath) ? { verdict: 'left', reason: `${reason} The folder ${request.worktreePath} could not be deleted.` } : { verdict: 'removed' };
}

function removeWithRetry(request: WorktreeRemovalRequest, primitives: WorktreeRemovalPrimitives = REAL_WORKTREE_REMOVAL_PRIMITIVES): WorktreeRemovalVerdict {
  if (!existsSync(request.worktreePath)) {
    primitives.runGit(request.repositoryDirectory, ['worktree', 'prune']);
    return { verdict: 'removed' };
  }
  const removalArguments = ['worktree', 'remove', ...(request.force === 'force' ? ['--force'] : []), request.worktreePath];
  let reason = '';
  for (let attempt = 1; attempt <= WORKTREE_REMOVAL_TRIES; attempt += 1) {
    if (attempt > 1) primitives.pause(WORKTREE_REMOVAL_STEP_MILLISECONDS);
    const run = primitives.runGit(request.repositoryDirectory, removalArguments);
    if (GitProcess.succeeded(run) && !existsSync(request.worktreePath)) return { verdict: 'removed' };
    reason = GitProcess.failureReasonOf(run, removalArguments);
    if (!existsSync(request.worktreePath)) break;
  }
  return deleteWhatGitNoLongerKnows(request, primitives, reason);
}

export const GitWorktrees = Object.freeze({
  ceilingOf,
  removeWithRetry,
  worktreeIsCheckoutOf,
  worktreeStateOf,
});
