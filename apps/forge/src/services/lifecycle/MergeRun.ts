/**
 * The git steps of one merge in its slot worktree, as verdicts: the merge-in against the recorded target tip, the restore an abort or requeue
 * starts from, the soundness and scope checks on a resolution and its size; also the merge of the target before a ticket's review, and who
 * takes a crossing ticket's conflict or red gate: the entity that owns it.
 */
import type { SettledTargetMerge }                    from '../../adapters/merge-settlement/MergeSettlementIngestion.ts';
import type { MergeSides }                            from '../../adapters/merge-sides/MergeSidesIngestion.ts';
import type { ReportProblem }                         from '../../adapters/reports/@types/ReportProblem.ts';
import type { Job, Airlock }                          from '../../domain/tracker-model/@types/Job.ts';
import type { EntityKey }                             from '../../domain/tracker-model/@types/Pipeline.ts';
import { EntityOwnershipUtil, type PipelineEntities } from '../../domain/tracker-model/utils/EntityOwnershipUtil.ts';
import { readMergeResolutionDiff }                    from '../../lib/git/BranchDiffs.ts';
import {
  mergeIn,
  resetTo,
  unmergedPathsIn,
  type MergeOutcome,
  type TipRestoreOutcome
} from '../../lib/git/BranchMerge.ts';
import { GitProcess }                                        from '../../lib/git/GitProcess.ts';
import { GitWorktrees }                                      from '../../lib/git/GitWorktrees.ts';
import { NOT_AN_ANCESTOR_EXIT_CODE }                         from '../../lib/git/constants/GitConventions.ts';
import type { AgentNaming, CustomsSubject, ProjectScope }    from './@types/CustomsSubject.ts';
import type { VerificationCheck, VerificationRefusalReason } from './@types/CustomsVerdict.ts';
import { CHECKS_OF_ROLE, CUSTOMS_CHECKS }                    from './Customs.ts';

const DIFF_FILE_HEADER = /^(?:\+\+\+|---) /;
const CHANGED_LINE     = /^[+-]/;

/** A ticket's merge starts from its branch and merges the target in; a group refresh starts from the group's tip and merges main's in. */
function sidesOf(job: Readonly<Pick<Job, 'kind'>>, slot: Readonly<Airlock>): MergeSides {
  return job.kind === 'refresh'
    ? { startTip: slot.targetTip, mergedTip: slot.branchTip }
    : { startTip: slot.branchTip, mergedTip: slot.targetTip };
}

function mergeIsInProgress(worktreePath: string): boolean {
  return GitProcess.resolvedCommitOf(worktreePath, 'MERGE_HEAD', GitWorktrees.ceilingOf(worktreePath)) !== null;
}

function headOf(worktreePath: string): string | null {
  return GitProcess.resolvedCommitOf(worktreePath, 'HEAD', GitWorktrees.ceilingOf(worktreePath));
}

function treeOf(worktreePath: string): string | null {
  const run = GitProcess.run(worktreePath, ['rev-parse', '--verify', '--quiet', 'HEAD^{tree}'], 'hooks-off', undefined, GitWorktrees.ceilingOf(worktreePath));
  return GitProcess.succeeded(run) ? run.standardOutput.trim() : null;
}

/** Against the recorded commit, never the moving name: a branch already descending from it is left as it is. */
function mergeInOnce(worktreePath: string, sides: Readonly<MergeSides>): MergeOutcome {
  return mergeIn(worktreePath, sides.mergedTip);
}

/** An unfinished merge is aborted first, then the worktree is reset to the tip the slot recorded, so the next attempt holds one merge-in. */
function restoreBranchTip(worktreePath: string, branchTip: string): TipRestoreOutcome {
  if (mergeIsInProgress(worktreePath)) GitProcess.run(worktreePath, ['merge', '--abort'], 'hooks-off', undefined, GitWorktrees.ceilingOf(worktreePath));
  return resetTo(worktreePath, branchTip);
}

/** Whether `commit` is in the history of the worktree's HEAD; `unknown` when git cannot tell. */
function headHoldsCommit(worktreePath: string, commit: string): 'holds' | 'lacks' | 'unknown' {
  const headCommit = headOf(worktreePath);
  if (headCommit === null) return 'unknown';
  const run = GitProcess.run(worktreePath, ['merge-base', '--is-ancestor', commit, headCommit], 'hooks-off', undefined, GitWorktrees.ceilingOf(worktreePath));
  if (GitProcess.succeeded(run)) return 'holds';
  return run?.exitCode === NOT_AN_ANCESTOR_EXIT_CODE ? 'lacks' : 'unknown';
}

/** The merge a process of its own runs in a ticket's worktree before its review: always a merge commit, with every hook off. */
function targetMergeCommandOf(gitProgramPath: string, targetTip: string): string[] {
  return GitProcess.commandOf(gitProgramPath, ['merge', '--no-ff', '--no-edit', '--quiet', targetTip], 'hooks-off');
}

/**
 * Read once the merge's process ended. A conflict is aborted and the worktree reset to the branch tip, so nothing of the merge stays; a
 * HEAD still on the branch tip is left as it is, so a merge git refused to start never resets the worktree.
 */
function settleTargetMerge(worktreePath: string, sides: Readonly<MergeSides>): SettledTargetMerge {
  if (mergeIsInProgress(worktreePath)) {
    const conflictedFiles = unmergedPathsIn(worktreePath) ?? [];
    const restore = restoreBranchTip(worktreePath, sides.startTip);
    if (restore.verdict !== 'restored') return { verdict: 'failed', failure: { code: 'conflicted-merge-not-undone', mergedTip: sides.mergedTip, restoreVerdict: restore.verdict } };
    if (conflictedFiles.length > 0) return { verdict: 'conflicted', conflictedFiles };
    return { verdict: 'failed', failure: { code: 'stopped-without-conflicted-file', mergedTip: sides.mergedTip } };
  }
  const headCommit = headOf(worktreePath);
  if (headCommit !== null && headCommit !== sides.startTip && headHoldsCommit(worktreePath, sides.mergedTip) === 'holds'
    && headHoldsCommit(worktreePath, sides.startTip) === 'holds') return { verdict: 'merged', mergeCommit: headCommit };
  if (headCommit !== sides.startTip) restoreBranchTip(worktreePath, sides.startTip);
  return { verdict: 'failed', failure: { code: 'merge-not-committed', mergedTip: sides.mergedTip, headCommit } };
}

function resolutionSubjectOf(worktreePath: string, sides: Readonly<MergeSides>, conflictedFiles: readonly string[], agentNaming: AgentNaming): CustomsSubject {
  return {
    role:                'airlock-agent',
    worktreePath,
    startCommit:         sides.startTip,
    report:              null,
    ticketBody:          '',
    contentHashAtLaunch: '',
    ticketContentHash:   '',
    merge:               { branchTip: sides.startTip, targetTip: sides.mergedTip, conflictedFiles },
    agentNaming,
  };
}

/** Nothing left unmerged, the conflicted files clean of whitespace errors, and a merge commit whose parents are the two recorded tips. */
function resolutionIsSound(worktreePath: string, sides: Readonly<MergeSides>, conflictedFiles: readonly string[], agentNaming: AgentNaming): boolean {
  return CUSTOMS_CHECKS.V10(resolutionSubjectOf(worktreePath, sides, conflictedFiles, agentNaming)).verdict === 'passed';
}

/** The Airlock agent's checks a project tracker's resolution adds to soundness; the launch snapshot check is left out, as no Airlock agent has one. */
const RESOLUTION_SCOPE_CHECKS: readonly VerificationCheck[] = ['V5', 'V17', 'V13'];

export type ResolutionScopeVerdict = { verdict: 'in-scope' } | { verdict: 'refused'; reason: VerificationRefusalReason; facts: readonly string[] };

/**
 * The scope checks on a resolution of a tracker in a project folder: the data folders, the project's folder and its reach, and the agent
 * configuration, each judged on what the resolution changed against git's automatic merge. A tracker at the root asks git nothing here.
 */
function resolutionScopeVerdictOf(
  worktreePath: string,
  sides: Readonly<MergeSides>,
  conflictedFiles: readonly string[],
  projectScope: Readonly<ProjectScope>,
  agentNaming: AgentNaming
): ResolutionScopeVerdict {
  if (projectScope.projectPrefix === '') return { verdict: 'in-scope' };
  const subject = { ...resolutionSubjectOf(worktreePath, sides, conflictedFiles, agentNaming), projectScope };
  for (const check of CHECKS_OF_ROLE['airlock-agent'].filter((columnCheck) => RESOLUTION_SCOPE_CHECKS.includes(columnCheck))) {
    const verdict = CUSTOMS_CHECKS[check](subject);
    if (verdict.verdict === 'refused') return verdict;
  }
  return { verdict: 'in-scope' };
}

/** A claim the conflict re-reviewer could not make hold: the Airlock cannot ask User for a waiver, so either one refuses the merge. */
const CLAIM_RESULTS_REFUSING_A_RE_REVIEW: readonly unknown[] = ['does-not-hold', 'waiver-proposed'];

export type ReReviewVerdict =
  | { verdict: 'holds' }
  | { verdict: 'customs-refused'; reason: VerificationRefusalReason; facts: readonly string[]; reportProblems?: readonly ReportProblem[] }
  | { verdict: 'claims-refused'; acceptanceItems: readonly string[] };

function claimsOf(report: unknown): readonly Readonly<Record<string, unknown>>[] {
  const claims = typeof report === 'object' && report !== null && Object.hasOwn(report, 'claims') ? (report as { claims: unknown }).claims : null;
  return Array.isArray(claims) ? claims.filter((claim): claim is Record<string, unknown> => typeof claim === 'object' && claim !== null) : [];
}

/**
 * The conflict re-reviewer's report, judged by the reviewer column's checks the Airlock can run: a valid reviewer report naming HEAD
 * and HEAD descending from the resolution it reviewed; then every claim holds after its fixes.
 */
function reReviewVerdictOf(worktreePath: string, resolutionCommit: string, report: unknown, agentNaming: AgentNaming): ReReviewVerdict {
  const subject = {
    role: 'reviewer', worktreePath, startCommit: resolutionCommit, report, ticketBody: '', contentHashAtLaunch: '', ticketContentHash: '', agentNaming
  } as const;
  for (const check of [CUSTOMS_CHECKS.V1, CUSTOMS_CHECKS.V2]) {
    const verdict = check(subject);
    if (verdict.verdict === 'refused') return { ...verdict, verdict: 'customs-refused' };
  }
  const acceptanceItems = claimsOf(report).filter((claim) => CLAIM_RESULTS_REFUSING_A_RE_REVIEW.includes(claim['result'])).map((claim) => String(claim['item']));
  return acceptanceItems.length === 0 ? { verdict: 'holds' } : { verdict: 'claims-refused', acceptanceItems };
}

/** The lines the merge commit at HEAD changed against git's automatic merge of its parents; `null` when git cannot tell. */
function resolutionLinesOf(worktreePath: string): number | null {
  const reading = readMergeResolutionDiff(worktreePath, 'HEAD');
  if (reading.verdict !== 'read') return null;
  return reading.diffText.split('\n').filter((line) => CHANGED_LINE.test(line) && !DIFF_FILE_HEADER.test(line)).length;
}

/** A crossing ticket as its landing reads it: the pipeline's entities, its home and the packages its package reviews sealed, in stage order. */
export interface CrossingLanding {
  entities:       PipelineEntities;
  homeEntity:     EntityKey;
  sealedPackages: readonly EntityKey[];
}

/** The files of one worker's part of a conflict, and whether it leaves the merge open for the worker after it. */
export interface ConflictPart {
  /** `null` for the home's part, else the sealed package whose builder resolves it. */
  packageEntity:      EntityKey | null;
  files:              readonly string[];
  leavesTheMergeOpen: boolean;
}

const REPOSITORY_ROOT_FOLDER = '/';

/**
 * A review's catch-up that conflicts in files no one stage may change parks the ticket for User: the catch-up's merge is aborted, so it is
 * never left open for a second worker as a landing's is.
 */
export const CONFLICT_WITHOUT_ONE_OWNER_PARK_CAUSE = 'conflict-without-one-owner';

/**
 * The first part of a crossing ticket's conflict, by owner: a sealed package's files go to its builder, the packages in their stage
 * order, and every other file to the home. Each part but the last leaves the merge open. `null` with no conflicted file.
 */
function firstConflictPartOf(landing: Readonly<CrossingLanding>, conflictedFiles: readonly string[]): ConflictPart | null {
  if (conflictedFiles.length === 0) return null;
  const ownerOf = (gitPath: string): EntityKey => EntityOwnershipUtil.ownerOf(landing.entities, `${REPOSITORY_ROOT_FOLDER}${gitPath}`);
  for (const packageEntity of landing.sealedPackages) {
    const files = conflictedFiles.filter((gitPath) => ownerOf(gitPath) === packageEntity);
    if (files.length > 0) return { packageEntity, files, leavesTheMergeOpen: files.length < conflictedFiles.length };
  }
  return { packageEntity: null, files: [...conflictedFiles], leavesTheMergeOpen: false };
}

/**
 * Who takes a red gate at landing: a sealed package for its own gate, else the first sealed package that the gate's entity consumes,
 * else the home.
 */
export type RedGateOwner = { owner: 'home' } | { owner: 'package'; packageEntity: EntityKey };

function redGateOwnerOf(landing: Readonly<CrossingLanding>, gateEntity: EntityKey | undefined): RedGateOwner {
  if (gateEntity === undefined || gateEntity === landing.homeEntity) return { owner: 'home' };
  if (landing.sealedPackages.includes(gateEntity)) return { owner: 'package', packageEntity: gateEntity };
  const packageEntity = landing.sealedPackages.find((sealedPackage) => EntityOwnershipUtil.dependentsOf(landing.entities, [sealedPackage]).includes(gateEntity));
  return packageEntity === undefined ? { owner: 'home' } : { owner: 'package', packageEntity };
}

export type OpenMergeVerdict = { verdict: 'handed-on'; remainingFiles: string[] } | { verdict: 'unresolved' };

/**
 * A worker that leaves the merge open hands it on only when the merge is still in progress on the recorded start, files of a later
 * worker are still unmerged, and none of `settledFiles` is: the files of the worker's own part, those of the workers before it, and those it
 * reports. So each hand-on leaves fewer files unmerged, and no part goes back to a worker that already had one.
 */
function openMergeVerdictOf(worktreePath: string, sides: Readonly<MergeSides>, settledFiles: readonly string[]): OpenMergeVerdict {
  if (headOf(worktreePath) !== sides.startTip) return { verdict: 'unresolved' };
  const unmergedPaths = unmergedPathsIn(worktreePath);
  if (unmergedPaths === null || unmergedPaths.length === 0 || unmergedPaths.some((path) => settledFiles.includes(path))) return { verdict: 'unresolved' };
  return { verdict: 'handed-on', remainingFiles: unmergedPaths };
}

export const MergeRun = Object.freeze({
  firstConflictPartOf,
  headHoldsCommit,
  headOf,
  mergeInOnce,
  mergeIsInProgress,
  openMergeVerdictOf,
  redGateOwnerOf,
  reReviewVerdictOf,
  resolutionIsSound,
  resolutionLinesOf,
  resolutionScopeVerdictOf,
  restoreBranchTip,
  settleTargetMerge,
  sidesOf,
  targetMergeCommandOf,
  treeOf,
});
