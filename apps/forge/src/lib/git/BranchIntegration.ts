/**
 * The git steps of bringing a branch into the main checkout, as verdicts: which branch the main checkout is on, whether a branch descends
 * from the main line, which commit a worktree stands at and what it holds beside it, the fast-forward itself, and the two cleanups.
 * Nothing here forces anything: a refusal git gives is handed back with git's own message.
 */
import { existsSync, rmSync } from 'node:fs';
import { join }               from 'node:path';

import type { GitRunFailure, HeadDiffersProblem, WorktreeRemovalProblem }             from './@types/GitProblem.ts';
import { GitProcess, type GitHookPolicy }                                             from './GitProcess.ts';
import { GitWorktrees }                                                               from './GitWorktrees.ts';
import { HeldCheckout, REAL_CHECKOUT_WRITE_PRIMITIVES, type CheckoutWritePrimitives } from './HeldCheckout.ts';
import { NOT_AN_ANCESTOR_EXIT_CODE }                                                  from './constants/GitConventions.ts';

const DETACHED_HEAD_EXIT_CODE = 1;

const PORCELAIN_STATUS_PREFIX_CHARACTERS = 3;

const UNTRACKED_STATUS_CODE = '??';

const STATUS_ARGUMENTS = ['status', '--porcelain=v1', '--untracked-files=all'];

const RENAME_OR_COPY_STATUS_CODES = ['R', 'C'] as const;

export type CurrentBranchReading =
  | { verdict: 'on-branch'; branch: string }
  | { verdict: 'detached' }
  | { verdict: 'git-failed'; problem: GitRunFailure };

export type BranchDescentReading =
  | { verdict: 'descendant'; branchCommit: string; mainLineCommit: string }
  | { verdict: 'not-a-descendant'; branchCommit: string; mainLineCommit: string }
  | { verdict: 'unknown-branch' }
  | { verdict: 'unknown-main-line' }
  | { verdict: 'git-failed'; problem: GitRunFailure };

export type FastForwardOutcome =
  | { verdict: 'fast-forwarded'; commit: string }
  | { verdict: 'refused'; problem: GitRunFailure | HeadDiffersProblem; blockingFiles: string[] }
  | { verdict: 'target-file-held'; problem: GitRunFailure; heldFiles: string[] };

export interface FilesLeftInWorktree {
  untrackedFiles: string[];
  changedFiles:   string[];
}

export type WorktreeCheckoutReading =
  | { verdict: 'read'; headCommit: string; filesBeside: FilesLeftInWorktree }
  | { verdict: 'not-a-directory' }
  | { verdict: 'git-failed'; problem: GitRunFailure };

export type WorktreeRemovalOutcome =
  | { verdict: 'removed' }
  | { verdict: 'left'; problem: WorktreeRemovalProblem; filesLeft: FilesLeftInWorktree };

export type BranchDeletionOutcome =
  | { verdict: 'deleted' }
  | { verdict: 'left'; problem: GitRunFailure };

export function readCurrentBranch(directory: string): CurrentBranchReading {
  const branchArguments = ['symbolic-ref', '--quiet', '--short', 'HEAD'];
  const run             = GitProcess.run(directory, branchArguments);
  if (run !== null && run.exitCode === DETACHED_HEAD_EXIT_CODE && run.standardError === '') return { verdict: 'detached' };
  if (!GitProcess.succeeded(run)) return { verdict: 'git-failed', problem: GitProcess.failureOf(run, branchArguments) };
  return { verdict: 'on-branch', branch: run.standardOutput.trim() };
}

/** Both names are looked up as local branches only, so the branch that was checked is the one a later branch deletion can delete. */
export function readBranchDescent(directory: string, branch: string, mainLine: string): BranchDescentReading {
  const branchCommit = GitProcess.resolvedCommitOf(directory, `refs/heads/${branch}`);
  if (branchCommit === null) return { verdict: 'unknown-branch' };
  const mainLineCommit = GitProcess.resolvedCommitOf(directory, `refs/heads/${mainLine}`);
  if (mainLineCommit === null) return { verdict: 'unknown-main-line' };

  const ancestryArguments = ['merge-base', '--is-ancestor', mainLineCommit, branchCommit];
  const ancestry          = GitProcess.run(directory, ancestryArguments);
  if (GitProcess.succeeded(ancestry)) return { verdict: 'descendant', branchCommit, mainLineCommit };
  if (ancestry !== null && ancestry.exitCode === NOT_AN_ANCESTOR_EXIT_CODE) return { verdict: 'not-a-descendant', branchCommit, mainLineCommit };
  return { verdict: 'git-failed', problem: GitProcess.failureOf(ancestry, ancestryArguments) };
}

function nulSeparatedFieldsOf(output: string): string[] {
  return output.split('\0').filter((field) => field !== '');
}

// `-z` leaves paths unquoted; a rename or copy entry is followed by a field of its own holding the path it came from.
function uncommittedPathsIn(directory: string): Set<string> {
  const run = GitProcess.run(directory, ['status', '--porcelain=v1', '-z', '--untracked-files=all']);
  const uncommittedPaths = new Set<string>();
  if (!GitProcess.succeeded(run)) return uncommittedPaths;
  const fields = nulSeparatedFieldsOf(run.standardOutput);
  for (let i = 0; i < fields.length; i++) {
    const entry = fields[i] ?? '';
    uncommittedPaths.add(entry.slice(PORCELAIN_STATUS_PREFIX_CHARACTERS));
    if (RENAME_OR_COPY_STATUS_CODES.some((statusCode) => entry.startsWith(statusCode))) uncommittedPaths.add(fields[++i] ?? '');
  }
  return uncommittedPaths;
}

function pathsChangedBetween(directory: string, commit: string): string[] {
  const run = GitProcess.run(directory, ['diff', '--name-only', '--no-renames', '-z', 'HEAD', commit, '--']);
  return GitProcess.succeeded(run) ? nulSeparatedFieldsOf(run.standardOutput) : [];
}

/**
 * The uncommitted paths, tracked or not, that the fast-forward would write over: what stops git, named so a person can commit or stash them.
 * Read before the merge, so a file git half wrote is never one of them.
 */
function blockingFilesOf(directory: string, commit: string): string[] {
  const uncommittedPaths = uncommittedPathsIn(directory);
  return pathsChangedBetween(directory, commit).filter((path) => uncommittedPaths.has(path));
}

const TREE_ENTRY_SEPARATOR = '\t';

/** Each file's blob in `revision`; a path the revision lacks has no entry. */
function blobsOfTree(directory: string, revision: string): Map<string, string> {
  const blobs = new Map<string, string>();
  const run   = GitProcess.run(directory, ['ls-tree', '-r', '-z', '--full-tree', revision]);
  if (!GitProcess.succeeded(run)) return blobs;
  for (const entry of nulSeparatedFieldsOf(run.standardOutput)) {
    const separatorIndex      = entry.indexOf(TREE_ENTRY_SEPARATOR);
    const [, , objectName = ''] = entry.slice(0, separatorIndex).split(' ');
    blobs.set(entry.slice(separatorIndex + 1), objectName);
  }
  return blobs;
}

/** The blob each present file's content would be, under the repository's filters; an empty map when git cannot answer. */
function blobsOfWorkingFiles(directory: string, paths: readonly string[]): Map<string, string> {
  const blobs = new Map<string, string>();
  if (paths.length === 0) return blobs;
  const run = GitProcess.run(directory, ['hash-object', '--stdin-paths'], 'hooks-off', `${paths.join('\n')}\n`);
  if (!GitProcess.succeeded(run)) return blobs;
  const objectNames = run.standardOutput.split('\n');
  if (objectNames.length < paths.length) return blobs;
  paths.forEach((path, i) => blobs.set(path, objectNames[i] ?? ''));
  return blobs;
}

/**
 * Puts back to HEAD each path the failed merge already wrote: a path the merge changes, not the owner's before the merge, whose file now
 * holds exactly the target commit's content (or is gone where the commit deletes it). Any other path is left as it is.
 */
function restorePathsWrittenByTheMerge(directory: string, commit: string, ownersPaths: readonly string[]): void {
  // `hash-object --stdin-paths` reads one path a line, so a path holding a newline cannot be compared and stays untouched.
  const candidates   = pathsChangedBetween(directory, commit).filter((path) => !ownersPaths.includes(path) && !path.includes('\n'));
  const targetBlobs  = blobsOfTree(directory, commit);
  const presentPaths = candidates.filter((path) => existsSync(join(directory, path)));
  const workingBlobs = blobsOfWorkingFiles(directory, presentPaths);
  const writtenPaths = candidates.filter((path) => {
    const targetBlob = targetBlobs.get(path);
    if (targetBlob === undefined) return !presentPaths.includes(path);
    return workingBlobs.get(path) === targetBlob;
  });
  if (writtenPaths.length === 0) return;
  const headBlobs = blobsOfTree(directory, 'HEAD');
  const pathsInHead = writtenPaths.filter((path) => headBlobs.has(path));
  if (pathsInHead.length > 0) {
    GitProcess.run(directory, ['--literal-pathspecs', 'checkout', 'HEAD', '--pathspec-from-file=-', '--pathspec-file-nul'], 'hooks-off', pathsInHead.join('\0'));
  }
  for (const path of writtenPaths.filter((writtenPath) => !headBlobs.has(writtenPath))) rmSync(join(directory, path), { force: true });
}

/**
 * Merges the commit that was checked, not the branch name, so a commit made to the branch after the check is not merged unseen. The
 * repository's own merge hooks run unless the caller turns them off. A file another process holds open stops git part way: what git wrote
 * is put back to HEAD and the merge is tried again, up to `HELD_CHECKOUT_RETRY_TRIES` times, before it is refused `target-file-held`.
 */
export function fastForwardTo(
  directory: string, commit: string, hookPolicy: GitHookPolicy = 'repository-hooks', primitives: CheckoutWritePrimitives = REAL_CHECKOUT_WRITE_PRIMITIVES
): FastForwardOutcome {
  const blockingFiles = blockingFilesOf(directory, commit);
  const merge         = HeldCheckout.writeRetryingWhileHeld({
    directory,
    gitArguments:     ['merge', '--ff-only', '--quiet', commit],
    hookPolicy,
    afterHeldFailure: () => restorePathsWrittenByTheMerge(directory, commit, blockingFiles),
  }, primitives);
  if (merge.verdict === 'failed') return { verdict: 'refused', problem: merge.problem, blockingFiles };
  if (merge.verdict === 'target-file-held') return merge;
  const headCommit = GitProcess.resolvedCommitOf(directory, 'HEAD');
  if (headCommit !== commit) {
    return { verdict: 'refused', problem: { code: 'head-differs-after-success', commandArguments: ['merge', '--ff-only', commit], headCommit }, blockingFiles: [] };
  }
  return { verdict: 'fast-forwarded', commit };
}

/** Ignored files are not named: git would not lose them, and a check run may leave them anywhere. */
function filesBesideTheCommitOf(statusOutput: string): FilesLeftInWorktree {
  const filesBeside: FilesLeftInWorktree = { untrackedFiles: [], changedFiles: [] };
  for (const line of statusOutput.split('\n')) {
    if (line.length <= PORCELAIN_STATUS_PREFIX_CHARACTERS) continue;
    const path = line.slice(PORCELAIN_STATUS_PREFIX_CHARACTERS);
    if (line.startsWith(UNTRACKED_STATUS_CODE)) filesBeside.untrackedFiles.push(path);
    else filesBeside.changedFiles.push(path);
  }
  return filesBeside;
}

function filesLeftIn(worktreePath: string): FilesLeftInWorktree {
  if (!GitProcess.directoryExists(worktreePath)) return { untrackedFiles: [], changedFiles: [] };
  const run = GitProcess.run(worktreePath, STATUS_ARGUMENTS, 'hooks-off', undefined, GitWorktrees.ceilingOf(worktreePath));
  if (!GitProcess.succeeded(run)) return { untrackedFiles: [], changedFiles: [] };
  return filesBesideTheCommitOf(run.standardOutput);
}

export function readWorktreeCheckout(worktreePath: string): WorktreeCheckoutReading {
  if (!GitProcess.directoryExists(worktreePath)) return { verdict: 'not-a-directory' };
  const ceiling       = GitWorktrees.ceilingOf(worktreePath);
  const headArguments = ['rev-parse', '--verify', 'HEAD^{commit}'];
  const headRun       = GitProcess.run(worktreePath, headArguments, 'hooks-off', undefined, ceiling);
  if (!GitProcess.succeeded(headRun)) return { verdict: 'git-failed', problem: GitProcess.failureOf(headRun, headArguments) };
  const statusRun = GitProcess.run(worktreePath, STATUS_ARGUMENTS, 'hooks-off', undefined, ceiling);
  if (!GitProcess.succeeded(statusRun)) return { verdict: 'git-failed', problem: GitProcess.failureOf(statusRun, STATUS_ARGUMENTS) };
  return { verdict: 'read', headCommit: headRun.standardOutput.trim(), filesBeside: filesBesideTheCommitOf(statusRun.standardOutput) };
}

/** Never `--force`: a worktree holding files git would lose is left standing, and what it holds is named so a person can decide. */
export function removeWorktree(mainCheckoutDirectory: string, worktreePath: string): WorktreeRemovalOutcome {
  const removal = GitWorktrees.removeWithRetry({ repositoryDirectory: mainCheckoutDirectory, worktreePath, force: 'never-force' });
  if (removal.verdict === 'removed') return { verdict: 'removed' };
  return { verdict: 'left', problem: removal.problem, filesLeft: filesLeftIn(worktreePath) };
}

/** `-d`, never `-D`: git deletes only a branch the main checkout's HEAD already holds. */
export function deleteMergedBranch(mainCheckoutDirectory: string, branch: string): BranchDeletionOutcome {
  const deletionArguments = ['branch', '-d', branch];
  const run               = GitProcess.run(mainCheckoutDirectory, deletionArguments);
  if (GitProcess.succeeded(run)) return { verdict: 'deleted' };
  return { verdict: 'left', problem: GitProcess.failureOf(run, deletionArguments) };
}
