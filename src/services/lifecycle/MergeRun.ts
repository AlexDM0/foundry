/**
 * The git steps of one merge in its slot worktree (design section 6.3), as verdicts: the one merge-in against the recorded target tip,
 * the restore to the recorded branch tip an abort or a requeue starts from, V10 on a resolution and the resolution's size. Also the merge
 * of the target into a ticket's worktree before its review, run by a process of its own and settled here.
 */
import { readMergeResolutionDiff } from '../../lib/git/BranchDiffs.ts';
import {
  mergeIn,
  resetTo,
  unmergedPathsIn,
  type MergeOutcome,
  type TipRestoreOutcome
} from '../../lib/git/BranchMerge.ts';
import { GitProcess }                     from '../../lib/git/GitProcess.ts';
import { GitWorktrees }                   from '../../lib/git/GitWorktrees.ts';
import { NOT_AN_ANCESTOR_EXIT_CODE }      from '../../lib/git/constants/GitConventions.ts';
import type { Job, Airlock }              from '../../lib/tracker-model/@types/Job.ts';
import type { VerificationRefusalReason } from './Customs.ts';
import { CUSTOMS_CHECKS }                 from './Customs.ts';

/** The commit the slot worktree starts from, its merge's first parent, and the one merged into it, its second. */
export interface MergeSides {
  startTip:  string;
  mergedTip: string;
}

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

export type TargetMergeSettlement =
  | { verdict: 'merged'; mergeCommit: string }
  | { verdict: 'conflicted'; conflictedFiles: string[] }
  | { verdict: 'failed'; reason: string };

/**
 * Read once the merge's process ended. A conflict is aborted and the worktree reset to the branch tip, so nothing of the merge stays; a
 * HEAD still on the branch tip is left as it is, so a merge git refused to start never resets the worktree.
 */
function settleTargetMerge(worktreePath: string, sides: Readonly<MergeSides>): TargetMergeSettlement {
  if (mergeIsInProgress(worktreePath)) {
    const conflictedFiles = unmergedPathsIn(worktreePath) ?? [];
    const restore = restoreBranchTip(worktreePath, sides.startTip);
    if (restore.verdict !== 'restored') return { verdict: 'failed', reason: `The conflicted merge of ${sides.mergedTip} could not be undone: ${restore.verdict}.` };
    if (conflictedFiles.length > 0) return { verdict: 'conflicted', conflictedFiles };
    return { verdict: 'failed', reason: `The merge of ${sides.mergedTip} stopped with no conflicted file.` };
  }
  const headCommit = headOf(worktreePath);
  if (headCommit !== null && headCommit !== sides.startTip && headHoldsCommit(worktreePath, sides.mergedTip) === 'holds'
    && headHoldsCommit(worktreePath, sides.startTip) === 'holds') return { verdict: 'merged', mergeCommit: headCommit };
  if (headCommit !== sides.startTip) restoreBranchTip(worktreePath, sides.startTip);
  return { verdict: 'failed', reason: `The merge of ${sides.mergedTip} did not commit; HEAD is ${headCommit ?? 'unreadable'}.` };
}

/** V10: nothing left unmerged, the conflicted files clean of whitespace errors, and a merge commit whose parents are the two recorded tips. */
function resolutionIsSound(worktreePath: string, sides: Readonly<MergeSides>, conflictedFiles: readonly string[]): boolean {
  return CUSTOMS_CHECKS.V10({
    role:             'airlock-agent',
    worktreePath,
    startCommit:      sides.startTip,
    report:           null,
    ticketBody:       '',
    bodyHashAtLaunch: '',
    merge:            { branchTip: sides.startTip, targetTip: sides.mergedTip, conflictedFiles },
  }).verdict === 'passed';
}

/** A claim the conflict re-reviewer could not make hold: the Airlock cannot ask User for a waiver, so either one refuses the merge. */
const CLAIM_RESULTS_REFUSING_A_RE_REVIEW: readonly unknown[] = ['does-not-hold', 'waiver-proposed'];

export type ReReviewVerdict =
  | { verdict: 'holds' }
  | { verdict: 'customs-refused'; reason: VerificationRefusalReason; facts: readonly string[] }
  | { verdict: 'claims-refused'; acceptanceItems: readonly string[] };

function claimsOf(report: unknown): readonly Readonly<Record<string, unknown>>[] {
  const claims = typeof report === 'object' && report !== null && Object.hasOwn(report, 'claims') ? (report as { claims: unknown }).claims : null;
  return Array.isArray(claims) ? claims.filter((claim): claim is Record<string, unknown> => typeof claim === 'object' && claim !== null) : [];
}

/**
 * The conflict re-reviewer's report, judged by the reviewer column's checks the Airlock can run: a valid reviewer report naming HEAD (V1)
 * and HEAD descending from the resolution it reviewed (V2); then every claim holds after its fixes.
 */
function reReviewVerdictOf(worktreePath: string, resolutionCommit: string, report: unknown): ReReviewVerdict {
  const subject = {
    role: 'reviewer', worktreePath, startCommit: resolutionCommit, report, ticketBody: '', bodyHashAtLaunch: ''
  } as const;
  for (const check of [CUSTOMS_CHECKS.V1, CUSTOMS_CHECKS.V2]) {
    const verdict = check(subject);
    if (verdict.verdict === 'refused') return { verdict: 'customs-refused', reason: verdict.reason, facts: verdict.facts };
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

export const MergeRun = Object.freeze({
  headHoldsCommit,
  headOf,
  mergeInOnce,
  mergeIsInProgress,
  reReviewVerdictOf,
  resolutionIsSound,
  resolutionLinesOf,
  restoreBranchTip,
  settleTargetMerge,
  sidesOf,
  targetMergeCommandOf,
  treeOf,
});
