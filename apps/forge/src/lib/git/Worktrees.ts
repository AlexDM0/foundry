/**
 * Preparing and repairing linked worktrees, as verdicts; removing one is `GitWorktrees.removeWithRetry`. Git run in a worktree is held below
 * the worktree's parent, so a folder without its `.git` never reads as the checkout above it.
 */
import { unlinkSync }       from 'node:fs';
import { isAbsolute, join } from 'node:path';

import { writeFileAtomically }      from '../atomic-file/AtomicFile.ts';
import type { WorktreeStepProblem } from './@types/GitProblem.ts';
import { GitProcess }               from './GitProcess.ts';
import { GitWorktrees }             from './GitWorktrees.ts';

function runInWorktree(worktreePath: string, gitArguments: readonly string[]): ReturnType<typeof GitProcess.run> {
  return GitProcess.run(worktreePath, gitArguments, 'hooks-off', undefined, GitWorktrees.ceilingOf(worktreePath));
}

const NO_INDEX_DIFFERENCES_FOUND_EXIT_CODE = 1;

const MISSING_FILE_CODE = 'ENOENT';

/** A porcelain v1 status line's two status columns and space; an untracked path's columns read `??`. */
const UNTRACKED_STATUS_PREFIX = '?? ';

export interface WorktreeRequest {
  repositoryDirectory: string;
  worktreesFolder:     string;
  worktreeName:        string;
  newBranch:           string;
  startCommit:         string;
}

export type WorktreeAdditionOutcome =
  | { verdict: 'added'; worktreePath: string; headCommit: string }
  | { verdict: 'unknown-commit' }
  | { verdict: 'refused'; problem: WorktreeStepProblem };

export type WorktreePruneOutcome =
  | { verdict: 'pruned' }
  | { verdict: 'refused'; problem: WorktreeStepProblem };

export type IndexLockRemovalOutcome =
  | { verdict: 'removed'; lockPath: string }
  | { verdict: 'absent'; lockPath: string }
  | { verdict: 'refused'; problem: WorktreeStepProblem };

export type UncommittedWorkSaveOutcome =
  | { verdict: 'saved'; patchPath: string; untrackedFiles: string[] }
  | { verdict: 'refused'; problem: WorktreeStepProblem };

function errorCodeOf(error: unknown): string | undefined {
  return typeof error === 'object' && error !== null && 'code' in error ? String((error as { code: unknown }).code) : undefined;
}

function nulSeparatedFieldsOf(output: string): string[] {
  return output.split('\0').filter((field) => field !== '');
}

/** The start commit is resolved first, so an option-shaped one is never obeyed and the new branch starts exactly where it was recorded. */
export function addWorktreeFromCommit(request: WorktreeRequest): WorktreeAdditionOutcome {
  const startCommit = GitProcess.resolvedCommitOf(request.repositoryDirectory, request.startCommit);
  if (startCommit === null) return { verdict: 'unknown-commit' };
  const worktreePath      = join(request.worktreesFolder, request.worktreeName);
  const additionArguments = ['worktree', 'add', '--quiet', '-b', request.newBranch, worktreePath, startCommit];
  const run               = GitProcess.run(request.repositoryDirectory, additionArguments);
  if (!GitProcess.succeeded(run)) return { verdict: 'refused', problem: GitProcess.failureOf(run, additionArguments) };
  return { verdict: 'added', worktreePath, headCommit: startCommit };
}

/**
 * The tracked paths a worktree holds changed beside its commit, untracked files left out; `null` when git fails. Straight after a checkout any
 * path here is a stored file the repository's attributes convert, such as a CRLF blob under `text=auto`.
 */
export function changedTrackedPathsOf(worktreePath: string): string[] | null {
  const run = runInWorktree(worktreePath, ['status', '--porcelain=v1', '--untracked-files=all', '--no-renames']);
  if (!GitProcess.succeeded(run)) return null;
  const changedLines = run.standardOutput.split('\n').filter((line) => line !== '' && !line.startsWith(UNTRACKED_STATUS_PREFIX));
  return changedLines.map((line) => line.slice(UNTRACKED_STATUS_PREFIX.length));
}

export function pruneWorktrees(repositoryDirectory: string): WorktreePruneOutcome {
  const pruneArguments = ['worktree', 'prune'];
  const run            = GitProcess.run(repositoryDirectory, pruneArguments);
  return GitProcess.succeeded(run) ? { verdict: 'pruned' } : { verdict: 'refused', problem: GitProcess.failureOf(run, pruneArguments) };
}

/**
 * The caller judges the lock stale (no git it started there is still running); this only finds the worktree's own lock, which in a
 * linked worktree lives under the main repository's `.git/worktrees/`, and removes it.
 */
export function removeStaleIndexLock(worktreePath: string): IndexLockRemovalOutcome {
  const lockPathArguments = ['rev-parse', '--git-path', 'index.lock'];
  const run               = runInWorktree(worktreePath, lockPathArguments);
  if (!GitProcess.succeeded(run)) return { verdict: 'refused', problem: GitProcess.failureOf(run, lockPathArguments) };
  const printedPath = run.standardOutput.trim();
  const lockPath    = isAbsolute(printedPath) ? printedPath : join(worktreePath, printedPath);
  try {
    unlinkSync(lockPath);
    return { verdict: 'removed', lockPath };
  } catch (error) {
    if (errorCodeOf(error) === MISSING_FILE_CODE) return { verdict: 'absent', lockPath };
    return { verdict: 'refused', problem: { code: 'index-lock-not-removed', lockPath, systemError: String(error) } };
  }
}

/** Each untracked file as a new-file patch against `/dev/null`, so the saved patch applies with one `git apply` on the same commit. */
function untrackedFilePatchOf(worktreePath: string, untrackedFile: string): string | null {
  const run = runInWorktree(worktreePath, ['diff', '--no-index', '--binary', '--', '/dev/null', untrackedFile]);
  if (run === null || run.exitCode !== NO_INDEX_DIFFERENCES_FOUND_EXIT_CODE) return null;
  return run.standardOutput;
}

/**
 * `git diff HEAD` (binary-safe) followed by every untracked, not ignored file as a new file, written atomically to the patch path. Nothing
 * in the worktree changes. Any step that fails refuses, and a refusal leaves no partial patch claimed as saved.
 */
export function saveUncommittedWork(worktreePath: string, patchPath: string): UncommittedWorkSaveOutcome {
  const trackedArguments = ['diff', '--binary', 'HEAD', '--'];
  const trackedRun       = runInWorktree(worktreePath, trackedArguments);
  if (!GitProcess.succeeded(trackedRun)) return { verdict: 'refused', problem: GitProcess.failureOf(trackedRun, trackedArguments) };
  const untrackedArguments = ['ls-files', '--others', '--exclude-standard', '-z'];
  const untrackedRun       = runInWorktree(worktreePath, untrackedArguments);
  if (!GitProcess.succeeded(untrackedRun)) return { verdict: 'refused', problem: GitProcess.failureOf(untrackedRun, untrackedArguments) };

  const untrackedFiles = nulSeparatedFieldsOf(untrackedRun.standardOutput);
  const patchParts     = [trackedRun.standardOutput];
  for (const untrackedFile of untrackedFiles) {
    const untrackedPatch = untrackedFilePatchOf(worktreePath, untrackedFile);
    if (untrackedPatch === null) return { verdict: 'refused', problem: { code: 'untracked-file-not-saved', untrackedFile } };
    patchParts.push(untrackedPatch);
  }
  try {
    writeFileAtomically(patchPath, patchParts.join(''));
  } catch (error) {
    return { verdict: 'refused', problem: { code: 'patch-not-written', patchPath, systemError: String(error) } };
  }
  return { verdict: 'saved', patchPath, untrackedFiles };
}
