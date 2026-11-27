/**
 * `merge accept` and `merge update`, User's merge approval moves (merge approval on). Both run their git step in the hold, as a worktree
 * repair does: the accept's `git merge-tree` prediction against the target's current tip, the update's merge in the ticket's worktree.
 */

import { GitProcess }                       from '../../lib/git/GitProcess.ts';
import { GitWorktrees }                     from '../../lib/git/GitWorktrees.ts';
import { predictMerge }                     from '../../lib/git/MergeTree.ts';
import type { Logged }                      from '../../lib/tracker-model/@types/BoardChanges.ts';
import type { BranchTreeOf, MergeTargetOf } from '../../lib/tracker-model/AirlockClaims.ts';
import type { ControlCommandOf }            from '../../shared/@types/ControlCommand.ts';
import { type BranchNames, branchNamesOf }  from '../../shared/BranchNames.ts';
import { OperationRefusal }                 from '../../shared/OperationRefusal.ts';
import { WorktreesFolder }                  from '../../shared/WorktreesFolder.ts';
import { MergeRun }                         from '../lifecycle/MergeRun.ts';
import { mainLineOf, mergeTargetRuleOf }    from '../lifecycle/MergeTargets.ts';
import type { BoardTransaction }            from '../tracker/BoardTransaction.ts';
import { ticketIdOfReference }              from './ControlTicketLookup.ts';

interface MergeApprovalSubject {
  ticketId:    string;
  target:      string;
  targetOf:    MergeTargetOf;
  branchNames: BranchNames;
}

function branchTreeIn(repositoryRoot: string, branchNames: BranchNames): BranchTreeOf {
  return (ticketId) => {
    const run = GitProcess.run(repositoryRoot, ['rev-parse', '--verify', '--quiet', `refs/heads/${branchNames.ticketBranchOf(ticketId)}^{tree}`]);
    return GitProcess.succeeded(run) ? run.standardOutput.trim() : null;
  };
}

function subjectOf(change: BoardTransaction, ticketReference: string): MergeApprovalSubject {
  const ticket = change.board.ticketByReference(ticketIdOfReference(change, ticketReference));
  if (ticket === undefined) throw new OperationRefusal('refused', { kind: 'no-readable-ticket', reference: ticketReference });
  const ticketId = ticket.frontmatter.id;
  change.board.refuseAMergeMoveWithApprovalOff(ticketId);
  const branchNames = branchNamesOf(change.board.branchNamespace());
  const targetOf = mergeTargetRuleOf(mainLineOf(change.workspace.rootDirectory), branchNames.groupTargetPrefix);
  return {
    ticketId, target: targetOf(ticket.frontmatter), targetOf, branchNames
  };
}

/** Only a ticket waiting for merge, its green current, is accepted, and only while git predicts a clean merge into its target's tip. */
function acceptMerge(command: ControlCommandOf<'merge-accept'>, change: BoardTransaction): Logged & { changed?: false } {
  const {
    ticketId, target, targetOf, branchNames
  } = subjectOf(change, command.ticketReference);
  if (change.board.ticketIsMergeAccepted(ticketId)) return { logged: [], changed: false };
  const repositoryRoot = change.workspace.rootDirectory;
  change.board.refuseAMergeAcceptOfATicketNotWaiting(ticketId, target, targetOf, branchTreeIn(repositoryRoot, branchNames));
  const prediction = predictMerge(repositoryRoot, { target, branch: branchNames.ticketBranchOf(ticketId) });
  if (prediction.verdict === 'conflicting') throw new OperationRefusal('refused', {
    kind: 'merge-accept-would-conflict', ticketId, target, conflictedFiles: prediction.conflictedFiles
  });
  if (prediction.verdict === 'prediction-failed') throw new OperationRefusal('refused', {
    kind: 'merge-accept-prediction-failed', ticketId, target, problem: prediction.problem
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
 * The target merged into the ticket's worktree, never while a job is on the ticket. Clean, the branch's green goes stale, so Hephaestus
 * gates it again: green queues it again, red returns it to its reviewer. A conflict is aborted and the ticket leaves the queue, so its
 * reviewer takes it back.
 */
function updateBranch(command: ControlCommandOf<'merge-update'>, change: BoardTransaction): Logged & { changed?: false } {
  const { ticketId, target } = subjectOf(change, command.ticketReference);
  change.board.refuseAMergeUpdateOfATicketNotWaiting(ticketId);
  const worktree = WorktreesFolder.ticketWorktreeOf(change.workspace.rootDirectory, ticketId);
  const startTip = MergeRun.headOf(worktree);
  const targetTip = GitProcess.resolvedCommitOf(change.workspace.rootDirectory, `refs/heads/${target}`);
  if (startTip === null || targetTip === null) {
    throw new OperationRefusal('refused', {
      kind: 'merge-update-failed', ticketId, target, problem: startTip === null ? { code: 'worktree-head-unreadable', worktree } : { code: 'target-unresolved' }
    });
  }
  const merge = MergeRun.mergeInOnce(worktree, { startTip, mergedTip: targetTip });
  if (merge.verdict === 'already-descends') return { logged: [], changed: false };
  if (merge.verdict === 'merged') return change.board.recordMergeUpdated(ticketId, target, 'merged', change.at);
  undoMergeUpdate(worktree, startTip);
  if (merge.verdict !== 'conflicted') {
    throw new OperationRefusal('refused', {
      kind: 'merge-update-failed', ticketId, target, problem: merge.verdict === 'git-failed' ? merge.problem : { code: 'unknown-commit' }
    });
  }
  return change.board.recordMergeUpdated(ticketId, target, 'conflicted', change.at);
}

export const AIRLOCK_CONTROLS = {
  'merge-accept': acceptMerge,
  'merge-update': updateBranch,
} as const;
