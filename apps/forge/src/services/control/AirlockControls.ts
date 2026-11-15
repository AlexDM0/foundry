/**
 * `merge accept` and `merge update`, User's merge approval moves (merge approval on). Both run their git step in the hold, as a worktree
 * repair does: the accept's `git merge-tree` prediction against the target's current tip, the update's merge in the ticket's worktree.
 */

import { GitProcess }                       from '../../lib/git/GitProcess.ts';
import { GitWorktrees }                     from '../../lib/git/GitWorktrees.ts';
import { predictMerge }                     from '../../lib/git/MergeTree.ts';
import type { Logged }                      from '../../lib/tracker-model/@types/BoardChanges.ts';
import type { TicketStatus }                from '../../lib/tracker-model/@types/Ticket.ts';
import type { BranchTreeOf, MergeTargetOf } from '../../lib/tracker-model/AirlockClaims.ts';
import { BoardRefusal }                     from '../../lib/tracker-model/BoardRefusal.ts';
import type { ControlCommandOf }            from '../../shared/@types/ControlCommand.ts';
import { OperationRefusal }                 from '../../shared/OperationRefusal.ts';
import { WorktreesFolder }                  from '../../shared/WorktreesFolder.ts';
import { MergeRun }                         from '../lifecycle/MergeRun.ts';
import { mainLineOf, mergeTargetRuleOf }    from '../lifecycle/MergeTargets.ts';
import type { TrackerChange }               from '../tracker/TrackerPipeline.ts';
import { ticketIdOfReference }              from './ControlTicketLookup.ts';

interface MergeApprovalSubject {
  ticketId: string;
  status:   TicketStatus;
  target:   string;
  targetOf: MergeTargetOf;
}

function branchTreeIn(repositoryRoot: string): BranchTreeOf {
  return (ticketId) => {
    const run = GitProcess.run(repositoryRoot, ['rev-parse', '--verify', '--quiet', `refs/heads/${WorktreesFolder.ticketBranchOf(ticketId)}^{tree}`]);
    return GitProcess.succeeded(run) ? run.standardOutput.trim() : null;
  };
}

function subjectOf(change: TrackerChange, ticketReference: string): MergeApprovalSubject {
  const ticket = change.board.ticketByReference(ticketIdOfReference(change, ticketReference));
  if (ticket === undefined) throw new OperationRefusal('refused', { kind: 'no-readable-ticket', reference: ticketReference });
  const ticketId = ticket.frontmatter.id;
  if (!change.board.mergeApprovalIsOn()) throw new BoardRefusal({ reason: 'merge-approval-off', ticketId });
  const targetOf = mergeTargetRuleOf(mainLineOf(change.workspace.rootDirectory));
  return {
    ticketId, status: ticket.frontmatter.status, target: targetOf(ticket.frontmatter), targetOf
  };
}

/** Only a ticket waiting for merge, its green current, is accepted, and only while git predicts a clean merge into its target's tip. */
function acceptMerge(command: ControlCommandOf<'merge-accept'>, change: TrackerChange): Logged & { changed?: false } {
  const {
    ticketId, status, target, targetOf
  } = subjectOf(change, command.ticketReference);
  if (change.board.ticketIsMergeAccepted(ticketId)) return { logged: [], changed: false };
  const repositoryRoot = change.workspace.rootDirectory;
  const waiting = change.board.ticketsWaitingForMergeOf(target, targetOf, branchTreeIn(repositoryRoot));
  if (!waiting.some((candidate) => candidate.ticketId === ticketId)) throw new BoardRefusal({ reason: 'merge-accept-of-a-ticket-not-waiting', ticketId, status });
  const prediction = predictMerge(repositoryRoot, { target, branch: WorktreesFolder.ticketBranchOf(ticketId) });
  if (prediction.verdict === 'conflicting') throw new BoardRefusal({
    reason: 'merge-accept-would-conflict', ticketId, target, conflictedFiles: prediction.conflictedFiles
  });
  if (prediction.verdict === 'prediction-failed') throw new BoardRefusal({
    reason: 'merge-accept-prediction-failed', ticketId, target, gitReason: prediction.reason
  });
  return change.board.setTicketMergeAccepted(ticketId, true, change.at);
}

/**
 * A merge git stopped on is aborted, which keeps the edits it never touched; the worktree is reset to its tip only when the abort failed or
 * HEAD moved, so a merge git refused to start, such as one an uncommitted edit stands in the way of, discards nothing.
 */
function undoMergeUpdate(worktree: string, startTip: string): void {
  const abortFailed = MergeRun.mergeIsInProgress(worktree)
    && !GitProcess.succeeded(GitProcess.run(worktree, ['merge', '--abort'], 'hooks-off', undefined, GitWorktrees.ceilingOf(worktree)));
  if (abortFailed || MergeRun.headOf(worktree) !== startTip) MergeRun.restoreBranchTip(worktree, startTip);
}

/**
 * The target merged into the ticket's worktree, never while a job is on the ticket. Clean, the branch's green goes stale, so the Overseer
 * gates it again: green queues it again, red returns it to its reviewer. A conflict is aborted and the ticket leaves the queue, so its
 * reviewer takes it back.
 */
function updateBranch(command: ControlCommandOf<'merge-update'>, change: TrackerChange): Logged & { changed?: false } {
  const { ticketId, status, target } = subjectOf(change, command.ticketReference);
  const ticketHasAJob = change.board.jobs().some((job) => job.ticketIds.includes(ticketId));
  if (!change.board.ticketIsMergeQueued(ticketId) || ticketHasAJob) throw new BoardRefusal({ reason: 'merge-update-of-a-ticket-not-waiting', ticketId, status });
  const worktree = WorktreesFolder.ticketWorktreeOf(change.workspace.rootDirectory, ticketId);
  const startTip = MergeRun.headOf(worktree);
  const targetTip = GitProcess.resolvedCommitOf(change.workspace.rootDirectory, `refs/heads/${target}`);
  if (startTip === null || targetTip === null) {
    throw new BoardRefusal({
      reason: 'merge-update-failed', ticketId, target, gitReason: startTip === null ? `${worktree} has no readable HEAD` : `${target} does not resolve`
    });
  }
  const merge = MergeRun.mergeInOnce(worktree, { startTip, mergedTip: targetTip });
  if (merge.verdict === 'already-descends') return { logged: [], changed: false };
  if (merge.verdict === 'merged') return change.board.recordMergeUpdated(ticketId, target, 'merged', change.at);
  undoMergeUpdate(worktree, startTip);
  if (merge.verdict !== 'conflicted') {
    throw new BoardRefusal({
      reason: 'merge-update-failed', ticketId, target, gitReason: merge.verdict === 'git-failed' ? merge.reason : 'unknown commit'
    });
  }
  return change.board.recordMergeUpdated(ticketId, target, 'conflicted', change.at);
}

export const AIRLOCK_CONTROLS = {
  'merge-accept': acceptMerge,
  'merge-update': updateBranch,
} as const;
