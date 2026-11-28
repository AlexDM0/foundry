/** What every Customs check reads: the worktree's git range and its changed paths, the report's fields and the subject's scope. */
import path from 'node:path';

import type { TicketStageName }                        from '../../domain/tracker-model/@types/Task.ts';
import { EntityOwnershipUtil }                         from '../../domain/tracker-model/utils/EntityOwnershipUtil.ts';
import type { GitPathStyle }                           from '../../lib/git/GitPaths.ts';
import { type GitHookPolicy, type GitRun, GitProcess } from '../../lib/git/GitProcess.ts';
import { GitWorktrees }                                from '../../lib/git/GitWorktrees.ts';

import type { CustomsSubject, RangeSubject }            from './@types/CustomsSubject.ts';
import type { CheckVerdict, VerificationRefusalReason } from './@types/CustomsVerdict.ts';

export const PASSED: CheckVerdict = { verdict: 'passed' };

export const HOST_PATH_STYLE: GitPathStyle = { pathModule: path, foldsCase: false };

/** A protected name matches in any case on every host: a branch merged on Linux is later checked out where case folds. */
function protectedFormOf(gitPath: string): string {
  return gitPath.toLowerCase();
}

export const REPOSITORY_ROOT_MARKER = '/';

export const GIT_SEPARATOR = '/';

function projectPrefixOf(subject: Pick<CustomsSubject, 'projectScope'>): string {
  return subject.projectScope?.projectPrefix ?? '';
}

function entityHomesOf(subject: Pick<CustomsSubject, 'projectScope'>): readonly string[] {
  return subject.projectScope?.entityHomes ?? [];
}

/** Each entity home as a git path in its protected form, without its leading and trailing `/`; a home at the root is left out, as `''`. */
function protectedHomeFoldersOf(entityHomes: readonly string[]): string[] {
  return entityHomes.map((home) => protectedFormOf(EntityOwnershipUtil.homeFolderOf(home).replace(/^\/+/u, ''))).filter((home) => home !== '');
}

/** The package stages of a crossing ticket: their reports state and confirm what the package exposes, and the Acceptance is not theirs. */
export const PACKAGE_STAGE_NAMES: readonly TicketStageName[] = ['package-build', 'package-review'];

function crossingStageNameOf(subject: Pick<CustomsSubject, 'crossingStage'>): TicketStageName | null {
  return subject.crossingStage?.stageName ?? null;
}

function isAPackageStage(stageName: TicketStageName | null): boolean {
  return stageName !== null && PACKAGE_STAGE_NAMES.includes(stageName);
}

function inAPackageStage(subject: Pick<CustomsSubject, 'crossingStage'>): boolean {
  return isAPackageStage(crossingStageNameOf(subject));
}

function refused(reason: VerificationRefusalReason, facts: readonly string[] = []): CheckVerdict {
  return { verdict: 'refused', reason, facts };
}

/** Every directory Customs reads is a job worktree, so git never walks above its parent into the main checkout. */
function worktreeGitRun(worktreePath: string, gitArguments: readonly string[], hookPolicy: GitHookPolicy = 'hooks-off'): GitRun | null {
  return GitProcess.run(worktreePath, gitArguments, hookPolicy, undefined, GitWorktrees.ceilingOf(worktreePath));
}

function worktreeCommitOf(worktreePath: string, revision: string): string | null {
  return GitProcess.resolvedCommitOf(worktreePath, revision, GitWorktrees.ceilingOf(worktreePath));
}

function gitLines(directory: string, gitArguments: readonly string[]): string[] | null {
  const run = worktreeGitRun(directory, gitArguments);
  if (!GitProcess.succeeded(run)) return null;
  return run.standardOutput.split('\n').filter((line) => line !== '');
}

/** The fields of a `-z` answer: git quotes no path there, so a name holding `"`, `\` or a control character keeps its own spelling. */
function gitFields(directory: string, gitArguments: readonly string[]): string[] | null {
  const run = worktreeGitRun(directory, gitArguments);
  if (!GitProcess.succeeded(run)) return null;
  return run.standardOutput.split('\0').filter((field) => field !== '');
}

/** A merge job's own commits leave out every commit the target tip holds, so the target's history is never judged as the job's. */
function rangeArgumentsOf({ startCommit, merge }: RangeSubject): string[] {
  return merge === undefined ? [`${startCommit}..HEAD`] : [`${startCommit}..HEAD`, `^${merge.targetTip}`];
}

function rangeOf(subject: RangeSubject): string {
  return rangeArgumentsOf(subject).join(' ');
}

/** `git merge-tree --write-tree` exits 1 when the tree it wrote holds conflicts, which is still the automatic merge. */
export const MERGE_TREE_CONFLICTED_EXIT_CODE = 1;

/** What the net diff is read from: git's automatic merge of branch and target when the job made that merge itself, so only its resolution counts. */
function netDiffBaseOf(subject: RangeSubject): string | null {
  const { worktreePath, startCommit, merge } = subject;
  if (merge === undefined) return startCommit;
  const mergesInRange = gitLines(worktreePath, ['rev-list', '--merges', ...rangeArgumentsOf(subject)]);
  if (mergesInRange === null) return null;
  if (mergesInRange.length === 0) return startCommit;
  const automaticMerge = worktreeGitRun(worktreePath, ['merge-tree', '--write-tree', '--no-messages', merge.branchTip, merge.targetTip]);
  if (!GitProcess.succeeded(automaticMerge) && automaticMerge?.exitCode !== MERGE_TREE_CONFLICTED_EXIT_CODE) return null;
  const automaticTree = automaticMerge?.standardOutput.split('\n')[0]?.trim() ?? '';
  return automaticTree === '' ? null : automaticTree;
}

/** Each commit's own paths, so a change a later commit undoes still counts, and the range's net diff, which holds a merge's resolution. */
function pathsChangedInRange(subject: RangeSubject): string[] | null {
  const netDiffBase       = netDiffBaseOf(subject);
  const pathsOfEachCommit = gitFields(subject.worktreePath, ['log', '--name-only', '--no-renames', '-z', '--format=', ...rangeArgumentsOf(subject), '--']);
  const pathsOfTheRange   = netDiffBase === null ? null : gitFields(subject.worktreePath, ['diff', '--name-only', '--no-renames', '-z', netDiffBase, 'HEAD', '--']);
  if (pathsOfEachCommit === null || pathsOfTheRange === null) return null;
  return [...new Set([...pathsOfEachCommit, ...pathsOfTheRange])];
}

function reportFieldOf(report: unknown, field: string): unknown {
  return typeof report === 'object' && report !== null && Object.hasOwn(report, field) ? (report as Record<string, unknown>)[field] : undefined;
}

function reportListOf(report: unknown, field: string): Record<string, unknown>[] {
  const value = reportFieldOf(report, field);
  return Array.isArray(value) ? value.filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null) : [];
}

/**
 * The paths the branch changed itself: those of its own commits, which `target` does not hold, and what HEAD changes against the newest
 * commit of `target` that the branch holds. A merge commit names no paths of its own here, so only what its tree changes against `target`
 * counts.
 */
function pathsTheBranchChangedPast(subject: RangeSubject, target: string): string[] | null {
  const base = worktreeGitRun(subject.worktreePath, ['merge-base', target, 'HEAD']);
  if (!GitProcess.succeeded(base)) return null;
  const pathsOfOwnCommits = gitLines(subject.worktreePath, ['log', '--name-only', '--no-renames', '--format=', ...rangeArgumentsOf(subject), `^${target}`, '--']);
  const pathsAgainstTarget = gitLines(subject.worktreePath, ['diff', '--name-only', '--no-renames', base.standardOutput.trim(), 'HEAD', '--']);
  if (pathsOfOwnCommits === null || pathsAgainstTarget === null) return null;
  return [...new Set([...pathsOfOwnCommits, ...pathsAgainstTarget])];
}

/**
 * The paths the branch changed itself past `target`, as the scope check judges a branch from its start: what the crossing after stage 1
 * sorts by owner. `null` when git cannot tell.
 */
function pathsTheBranchChangedPastTargetOf(worktreePath: string, startCommit: string, target: string): string[] | null {
  return pathsTheBranchChangedPast({ worktreePath, startCommit }, target);
}

export const CustomsReadings = Object.freeze({
  protectedFormOf,
  projectPrefixOf,
  entityHomesOf,
  protectedHomeFoldersOf,
  crossingStageNameOf,
  isAPackageStage,
  inAPackageStage,
  refused,
  worktreeGitRun,
  worktreeCommitOf,
  gitLines,
  gitFields,
  rangeArgumentsOf,
  rangeOf,
  netDiffBaseOf,
  pathsChangedInRange,
  reportFieldOf,
  reportListOf,
  pathsTheBranchChangedPast,
  pathsTheBranchChangedPastTargetOf,
});
