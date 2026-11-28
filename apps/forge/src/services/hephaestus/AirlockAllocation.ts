/**
 * Allocation of a free target's slot: a waiting constitution commit first on the main line, then a due group refresh, then the first
 * ticket in design section 6.2's order, each claimed in a hold that checks the tips did not move.
 */
import type { MergeCandidate }                                             from '../../domain/tracker-model/AirlockClaims.ts';
import { MERGE_PRIORITY_RANK }                                             from '../../domain/tracker-model/AirlockClaims.ts';
import { MergeQueueUtil, type MergeForecast }                              from '../../domain/tracker-model/utils/MergeQueueUtil.ts';
import { GitProcess }                                                      from '../../lib/git/GitProcess.ts';
import { predictMerge, predictMerges }                                     from '../../lib/git/MergeTree.ts';
import type { AirlockAllocation, AirlockSlots, ConstitutionCommitAirlock } from './@types/AirlockParts.ts';
import type { AirlocksContext }                                            from './@types/Airlocks.ts';
import { AirlockReadings }                                                 from './AirlockReadings.ts';
import { REFRESH_REFUSAL_SEPARATOR }                                       from './AirlockSlots.ts';

function forecastOf(prediction: ReturnType<typeof predictMerge>): MergeForecast {
  return prediction.verdict;
}

export function createAirlockAllocation(
  context: AirlocksContext, slots: AirlockSlots, constitutionCommits: ConstitutionCommitAirlock
): AirlockAllocation {
  const { mainLine } = context;
  const {
    branchTreeOf, groupOf, heldTargets, targetOf
  } = slots;
  const { allocateConstitutionCommit } = constitutionCommits;

  function predictionOf(target: string, candidate: MergeCandidate): { candidate: MergeCandidate; branchTip: string | null; conflictedFiles: string[] | null } {
    const branch    = context.branchNames.ticketBranchOf(candidate.ticketId);
    const branchTip = GitProcess.resolvedCommitOf(context.repositoryRoot, `refs/heads/${branch}`);
    const predicted = predictMerge(context.repositoryRoot, { target, branch });
    return { candidate, branchTip, conflictedFiles: predicted.verdict === 'clean' ? [] : predicted.verdict === 'conflicting' ? predicted.conflictedFiles : null };
  }

  /**
   * Design section 6.2's order: priority, clean first, fewest conflicts caused among the clean, readiness, ticket id. With merge approval
   * on, User's press order alone: readiness is the accept's place in the log, then ticket id.
   */
  function orderedPredictions(target: string, candidates: readonly MergeCandidate[], followsPressOrder: boolean): ReturnType<typeof predictionOf>[] {
    if (followsPressOrder) {
      const [first] = MergeQueueUtil.pressOrderOf(candidates.map((candidate) => ({ ...candidate, queuedLogPosition: candidate.readiness })));
      const prediction = first === undefined ? null : predictionOf(target, first);
      return prediction === null || prediction.branchTip === null ? [] : [prediction];
    }
    const predictions = candidates.map((candidate) => predictionOf(target, candidate)).filter((prediction) => prediction.branchTip !== null);
    const clean       = predictions.filter((prediction) => prediction.conflictedFiles?.length === 0);
    const conflictsCaused = new Map(predictions.map((prediction) => {
      const others = clean.filter((other) => other.candidate.ticketId !== prediction.candidate.ticketId);
      const branch = context.branchNames.ticketBranchOf(prediction.candidate.ticketId);
      const pairs  = others.map((other) => ({ target: context.branchNames.ticketBranchOf(other.candidate.ticketId), branch }));
      return [prediction.candidate.ticketId, predictMerges(context.repositoryRoot, pairs).filter((pair) => pair.verdict !== 'clean').length];
    }));
    const isClean = (prediction: ReturnType<typeof predictionOf>): number => (prediction.conflictedFiles?.length === 0 ? 0 : 1);
    return predictions.sort((a, b) => (
      MERGE_PRIORITY_RANK[a.candidate.priority] - MERGE_PRIORITY_RANK[b.candidate.priority]
      || isClean(a) - isClean(b)
      || (conflictsCaused.get(a.candidate.ticketId) ?? 0) - (conflictsCaused.get(b.candidate.ticketId) ?? 0)
      || a.candidate.readiness - b.candidate.readiness
      || Number(a.candidate.ticketId) - Number(b.candidate.ticketId)
    ));
  }

  /** Due as MergeQueueUtil says, never while a refused refresh of the group waits for User or main holds nothing the group lacks. */
  function refreshIsDue(target: string, releaseIsQueuedOrSlotted: boolean, refreshWasRefused: boolean): boolean {
    if (refreshWasRefused) return false;
    const count = GitProcess.run(context.repositoryRoot, ['rev-list', '--count', `${target}..${mainLine}`]);
    const mainCommitsAheadOfGroup = GitProcess.succeeded(count) ? Number(count.standardOutput.trim()) : null;
    if (mainCommitsAheadOfGroup === 0) return false;
    return MergeQueueUtil.groupRefreshIsDue({
      mainCommitsAheadOfGroup,
      groupTipAgainstMain:            forecastOf(predictMerge(context.repositoryRoot, { target, branch: mainLine })),
      releaseTicketIsQueuedOrSlotted: releaseIsQueuedOrSlotted,
    }, context.limits);
  }

  async function allocateRefresh(target: string, releaseIsQueuedOrSlotted: boolean, refreshWasRefused: boolean): Promise<boolean> {
    const targetTip = GitProcess.resolvedCommitOf(context.repositoryRoot, `refs/heads/${target}`);
    const mainTip   = GitProcess.resolvedCommitOf(context.repositoryRoot, `refs/heads/${mainLine}`);
    if (targetTip === null || mainTip === null || !refreshIsDue(target, releaseIsQueuedOrSlotted, refreshWasRefused)) return false;
    return context.hold((hold) => {
      const tipsMoved = GitProcess.resolvedCommitOf(context.repositoryRoot, `refs/heads/${target}`) !== targetTip
        || GitProcess.resolvedCommitOf(context.repositoryRoot, `refs/heads/${mainLine}`) !== mainTip;
      return tipsMoved || AirlockReadings.claimed(() => hold.board.claimRefreshSlot({
        group: groupOf(target), target, targetTip, mainTip
      }, hold.at));
    });
  }

  async function allocate(target: string): Promise<boolean> {
    if (target === mainLine) {
      const constitutionCommit = await allocateConstitutionCommit();
      if (constitutionCommit !== 'none') return constitutionCommit === 'allocated';
    }
    if (heldTargets.has(target) || context.dispatchIsStopped()) return false;
    const queue = await context.hold((hold) => {
      if (hold.board.airlockHolderOf(target) !== undefined || hold.board.pipeline() === null) return null;
      const isGroup = target !== mainLine;
      return {
        candidates:               hold.board.mergeCandidatesOf(target, targetOf, branchTreeOf),
        followsPressOrder:        hold.board.mergeApprovalIsOn(),
        releaseIsQueuedOrSlotted: isGroup && hold.board.groupReleaseQueuedOrSlotted(groupOf(target)) !== null,
        refreshWasRefused:        isGroup && hold.board.decisions().some((decision) => (
          decision.kind === 'merge-refused' && decision.ticketIds.length === 0 && decision.context.startsWith(`${target}${REFRESH_REFUSAL_SEPARATOR}`)
        )),
      };
    });
    if (queue === null) return false;
    if (target !== mainLine && await allocateRefresh(target, queue.releaseIsQueuedOrSlotted, queue.refreshWasRefused)) return true;
    const [first] = orderedPredictions(target, queue.candidates, queue.followsPressOrder);
    if (first?.branchTip === undefined || first.branchTip === null) return false;
    const targetTip = GitProcess.resolvedCommitOf(context.repositoryRoot, `refs/heads/${target}`);
    if (targetTip === null) return false;
    const { branchTip } = first;
    return context.hold((hold) => {
      const tipsMoved = GitProcess.resolvedCommitOf(context.repositoryRoot, `refs/heads/${target}`) !== targetTip
        || GitProcess.resolvedCommitOf(context.repositoryRoot, `refs/heads/${context.branchNames.ticketBranchOf(first.candidate.ticketId)}`) !== branchTip;
      return tipsMoved || AirlockReadings.claimed(() => hold.board.claimAirlock({
        ticketId: first.candidate.ticketId, target, targetTip, branchTip, predictedConflictFiles: first.conflictedFiles ?? [],
      }, targetOf, branchTreeOf, hold.at));
    });
  }

  return { allocate };
}
