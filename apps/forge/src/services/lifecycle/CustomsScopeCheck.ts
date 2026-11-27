/**
 * V17: the branch stays in the project's folder and `reach`, or a job of an entity in its writable folders; a constitution changes only in
 * its own entity's job; and a crossed package's sealed change stays as its seal holds it.
 */
import { createHash } from 'node:crypto';

import type { TicketStageName } from '../../domain/tracker-model/@types/Task.ts';
import { EntityOwnershipUtil }  from '../../domain/tracker-model/utils/EntityOwnershipUtil.ts';
import { GitProcess }           from '../../lib/git/GitProcess.ts';

import type {
  ConstitutionOwnership,
  CustomsSubject,
  ProjectScope,
  RangeSubject,
  WritableFolders
} from './@types/CustomsSubject.ts';
import type { CheckVerdict } from './@types/CustomsVerdict.ts';
import {
  crossingStageNameOf,
  GIT_SEPARATOR,
  gitLines,
  isAPackageStage,
  PASSED,
  pathsChangedInRange,
  pathsTheBranchChangedPast,
  protectedFormOf,
  rangeArgumentsOf,
  rangeOf,
  refused,
  REPOSITORY_ROOT_MARKER,
  worktreeGitRun
} from './CustomsReadings.ts';

/** The difference a seal hashes, with no context lines, so a change of the target near the package change leaves it as it was. */
const SEAL_DIFFERENCE_ARGUMENTS: readonly string[] = ['diff', '--no-color', '--no-ext-diff', '--binary', '--no-renames', '-U0'];

/** What a merge of the target moves in that difference: each hunk's line numbers and each blob id. */
const LINES_A_TARGET_MERGE_MOVES: readonly string[] = ['@@', 'index '];

/**
 * A package's seal (strategy 4.2): a hash of the ticket's own change on `pathspecs`, the difference between the newest commit of `target`
 * that the branch holds and HEAD. A merge of the main line never breaks it (E35). `null` when git cannot tell.
 */
export function sealOf(worktreePath: string, target: string, pathspecs: readonly string[]): string | null {
  const base = worktreeGitRun(worktreePath, ['merge-base', target, 'HEAD']);
  if (!GitProcess.succeeded(base)) return null;
  const difference = worktreeGitRun(worktreePath, [...SEAL_DIFFERENCE_ARGUMENTS, base.standardOutput.trim(), 'HEAD', '--', ...pathspecs]);
  if (!GitProcess.succeeded(difference)) return null;
  const sealedLines = difference.standardOutput.split('\n').filter((line) => !LINES_A_TARGET_MERGE_MOVES.some((prefix) => line.startsWith(prefix)));
  return createHash('sha256').update(sealedLines.join('\n')).digest('hex');
}

function reachEntryOf(reachPath: string): string {
  return reachPath.replace(/^\/+/, '').replace(/\/+$/, '');
}

/** The git paths among `gitPaths` outside the project's folder and every reach entry, a file or a folder; none for a tracker at the root. */
export function pathsOutsideHomeAndReachOf(gitPaths: readonly string[], projectScope: ProjectScope): string[] {
  const { projectPrefix, reach } = projectScope;
  if (projectPrefix === '') return [];
  const allowedPaths = [projectPrefix, ...reach.map(reachEntryOf)];
  return gitPaths.filter((gitPath) => !allowedPaths.some((allowed) => gitPath === allowed || gitPath.startsWith(`${allowed}${GIT_SEPARATOR}`)));
}

/** The length of the deepest of `folders` that holds `repositoryPath`, or the path itself; `-1` when none does. */
function deepestFolderHolding(folders: readonly string[], repositoryPath: string): number {
  return folders.map(EntityOwnershipUtil.homeFolderOf)
    .filter((folder) => repositoryPath === folder || repositoryPath.startsWith(`${folder}${GIT_SEPARATOR}`))
    .reduce((deepest, folder) => Math.max(deepest, folder.length), -1);
}

/**
 * The git paths among `gitPaths` that a job of an entity may not change: outside its `reach`, and outside its homes or held by a deeper home
 * of another entity.
 */
export function pathsOutsideWritableFoldersOf(gitPaths: readonly string[], writableFolders: WritableFolders): string[] {
  return gitPaths.filter((gitPath) => {
    const repositoryPath = `${REPOSITORY_ROOT_MARKER}${gitPath}`;
    if (deepestFolderHolding(writableFolders.reach, repositoryPath) >= 0) return false;
    const ownHomeDepth = deepestFolderHolding(writableFolders.homes, repositoryPath);
    return ownHomeDepth < 0 || deepestFolderHolding(writableFolders.otherHomes, repositoryPath) > ownHomeDepth;
  });
}

/** The paths of the job's own commits past its target: a later stage of a crossing ticket answers only for these. */
function pathsOfOwnCommitsPast(subject: RangeSubject, target: string): string[] | null {
  return gitLines(subject.worktreePath, ['log', '--name-only', '--no-renames', '--format=', ...rangeArgumentsOf(subject), `^${target}`, '--']);
}

/**
 * The paths in `reach` that the commits from `startCommit` to HEAD changed past `target`: the `reach` paths a package's stages changed, which
 * join its seal (E3). `null` when git cannot tell.
 */
export function reachPathsChangedSinceOf(worktreePath: string, startCommit: string, target: string, reach: readonly string[]): string[] | null {
  const paths = pathsOfOwnCommitsPast({ worktreePath, startCommit }, target);
  if (paths === null) return null;
  return [...new Set(paths.filter((gitPath) => deepestFolderHolding(reach, `${REPOSITORY_ROOT_MARKER}${gitPath}`) >= 0))];
}

/**
 * What the scope check judges: in a later stage of a crossing, the commits since the stage's run began, so a retry still answers for the
 * commits of the job it retries; else what the branch changed itself past its target.
 */
function pathsTheScopeJudges(subject: CustomsSubject): string[] | null {
  if (subject.target === undefined) return pathsChangedInRange(subject);
  const stageName = crossingStageNameOf(subject);
  if (stageName === null || stageName === 'build') return pathsTheBranchChangedPast(subject, subject.target);
  return pathsOfOwnCommitsPast({ ...subject, startCommit: subject.crossingStage?.stageStartCommit ?? subject.startCommit }, subject.target);
}

/**
 * In stage 1 a path in a whitelisted package's home is a proposal; the paths outside both, else the branch's paths outside the entity's own
 * homes and `reach` when it changed nothing there (E15), else none.
 */
function pathsOutsideTheStageOf(paths: readonly string[], writableFolders: WritableFolders): { outside: string[]; onlyOutside: boolean } {
  const outsideOwnFolders = pathsOutsideWritableFoldersOf(paths, writableFolders);
  const proposalHomes = writableFolders.proposalHomes ?? [];
  if (proposalHomes.length === 0) return { outside: outsideOwnFolders, onlyOutside: outsideOwnFolders.length === paths.length };
  const outside = pathsOutsideWritableFoldersOf(paths, { ...writableFolders, homes: [...writableFolders.homes, ...proposalHomes] });
  if (outside.length > 0) return { outside, onlyOutside: outsideOwnFolders.length === paths.length };
  return outsideOwnFolders.length === paths.length && paths.length > 0 ? { outside: outsideOwnFolders, onlyOutside: true } : { outside: [], onlyOutside: false };
}

/**
 * The constitutions among `gitPaths` that the job may not change (E8): each one another entity's than the ticket's, and in a package stage
 * every one. The ticket body naming a file never lets it through; V11 only refuses a constitution the body does not name.
 */
export function constitutionsChangedOutsideTheTicketEntityOf(
  gitPaths: readonly string[], ownership: Readonly<ConstitutionOwnership>, stageName: TicketStageName | null
): string[] {
  const changedForms = new Set(gitPaths.map(protectedFormOf));
  return ownership.constitutions
    .filter((constitution) => changedForms.has(protectedFormOf(constitution.gitPath)))
    .filter((constitution) => isAPackageStage(stageName) || constitution.entity !== ownership.ticketEntity)
    .map((constitution) => constitution.gitPath);
}

/** The first sealed change the branch no longer holds as sealed; the Airlock's merge and conflict work never alter a seal. */
function sealedChangesHeld(subject: CustomsSubject): CheckVerdict {
  const seals = subject.crossingStage?.seals ?? [];
  if (subject.role === 'airlock-agent' || seals.length === 0) return PASSED;
  const target = subject.target ?? subject.startCommit;
  for (const sealed of seals) {
    const seal = sealOf(subject.worktreePath, target, sealed.pathspecs);
    if (seal === null) return refused('git-failed', [target]);
    if (seal !== sealed.seal) return refused('sealed-change-altered', [sealed.entity]);
  }
  return PASSED;
}

/**
 * Judged on what the branch changed itself past its target, so a merge of the main line bringing a sibling's landing in never counts. A
 * tracker at the root asks git nothing here, unless the job is a job of an entity, whose branch that changed nothing in its own folders is
 * refused apart: all its work belongs to another entity (E15, stage 1 only; a later stage's change outside its folders is an ordinary
 * refusal, E23). A constitution changes only in a job of its own entity's ticket, outside a package stage (E8). A later job of a crossing
 * ticket may not alter a sealed change (E33).
 */
export function changesStayInHomeAndReach(subject: CustomsSubject): CheckVerdict {
  const { projectScope } = subject;
  if (projectScope === undefined) return PASSED;
  const { writableFolders } = projectScope;
  if (writableFolders === undefined && projectScope.projectPrefix === '') return PASSED;
  const paths = pathsTheScopeJudges(subject);
  if (paths === null) return refused('git-failed', [subject.target ?? rangeOf(subject)]);
  if (writableFolders === undefined) {
    const outside = pathsOutsideHomeAndReachOf(paths, projectScope);
    return outside.length === 0 ? PASSED : refused('changed-outside-home-and-reach', outside);
  }
  const { outside, onlyOutside } = pathsOutsideTheStageOf(paths, writableFolders);
  const stageName = crossingStageNameOf(subject);
  const allWorkInAnotherEntityCounts = stageName === null || stageName === 'build';
  if (outside.length > 0) return refused(onlyOutside && allWorkInAnotherEntityCounts ? 'changed-only-outside-home-and-reach' : 'changed-outside-home-and-reach', outside);
  const { constitutions } = projectScope;
  const constitutionsRefused = constitutions === undefined ? [] : constitutionsChangedOutsideTheTicketEntityOf(paths, constitutions, stageName);
  if (constitutionsRefused.length > 0) return refused('constitution-outside-ticket-entity', constitutionsRefused);
  return sealedChangesHeld(subject);
}
