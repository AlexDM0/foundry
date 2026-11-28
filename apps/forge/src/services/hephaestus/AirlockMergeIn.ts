/**
 * The `merge-in` phase: the one merge of the recorded target tip into the slot's worktree, which goes on to the gate, launches the agent of
 * a conflict's first part, or refuses the merge.
 */
import type { Job }                                         from '../../domain/tracker-model/@types/Job.ts';
import { GitProcess }                                       from '../../lib/git/GitProcess.ts';
import { MergeRun }                                         from '../lifecycle/MergeRun.ts';
import type { AirlockAgents, AirlockMergeIn, AirlockSlots } from './@types/AirlockParts.ts';
import type { AirlocksContext }                             from './@types/Airlocks.ts';
import { AirlockAgentHistory }                              from './AirlockAgentHistory.ts';
import { AirlockReadings }                                  from './AirlockReadings.ts';
import { GroupWorktrees }                                   from './GroupWorktrees.ts';
import { MERGE_REFUSED_CAUSES, REQUEUE_CAUSES }             from './constants/AirlockCauses.ts';

export function createAirlockMergeIn(context: AirlocksContext, slots: AirlockSlots, agents: AirlockAgents): AirlockMergeIn {
  const { mainLine, branchNames: { groupTargetPrefix } } = context;
  const {
    freeSlot, refuseMerge, setPhase, slotWorktreeOf
  } = slots;
  const { launchAirlockAgent } = agents;

  /** A release carries the group's whole tip to the main line; one forked before a later landing or refresh would deliver work main lacks. */
  async function releaseGapOf(job: Readonly<Job>): Promise<string | null> {
    if (AirlockReadings.isRefresh(job) || AirlockReadings.slotOf(job).target !== mainLine) return null;
    const ticketId = AirlockReadings.ticketIdOf(job);
    const group = await context.hold((hold) => {
      const ticket = hold.board.tickets().find((candidate) => candidate.frontmatter.id === ticketId);
      return ticket?.frontmatter.releasesGroup === true ? ticket.frontmatter.group : undefined;
    });
    if (group === undefined) return null;
    const groupBranch = `${groupTargetPrefix}${group}`;
    const groupTip    = GitProcess.resolvedCommitOf(context.repositoryRoot, `refs/heads/${groupBranch}`);
    if (groupTip === null) return null;
    const descends = GitProcess.run(context.repositoryRoot, ['merge-base', '--is-ancestor', groupTip, AirlockReadings.slotOf(job).branchTip]);
    return GitProcess.succeeded(descends) ? null : `The release branch of #${ticketId} does not hold ${groupBranch}'s tip ${groupTip}.`;
  }

  async function runMergeIn(job: Readonly<Job>): Promise<boolean> {
    const worktree = slotWorktreeOf(job);
    const slot     = AirlockReadings.slotOf(job);
    if (AirlockReadings.isRefresh(job)) {
      const prepared = GroupWorktrees.prepareRefreshWorktree(context.repositoryRoot, context.worktreesRoot, slot.target, slot.targetTip);
      if (prepared.verdict === 'git-failed') {
        await refuseMerge(job, MERGE_REFUSED_CAUSES.gitFailed, context.mergeDecisionSentenceOf(prepared.problem));
        return true;
      }
    }
    if (MergeRun.mergeIsInProgress(worktree)) {
      // A live holder keeps its slot; only a merge-in left behind by nobody is aborted and requeued.
      if (context.childIsLive(job)) return false;
      await freeSlot(job, { outcome: 'stopped', cause: REQUEUE_CAUSES.orphaned });
      return true;
    }
    const releaseGap = await releaseGapOf(job);
    if (releaseGap !== null) {
      await refuseMerge(job, MERGE_REFUSED_CAUSES.releaseBehindGroup, releaseGap);
      return true;
    }
    const merge = MergeRun.mergeInOnce(worktree, MergeRun.sidesOf(job, slot));
    if (merge.verdict === 'merged' || merge.verdict === 'already-descends') {
      await context.hold((hold) => setPhase(hold, job, 'gating'));
      return true;
    }
    if (merge.verdict === 'conflicted' && AirlockReadings.isRefresh(job)) {
      // A refresh has no ticket agent to resolve it: User decides.
      await refuseMerge(job, MERGE_REFUSED_CAUSES.refreshConflicted, `The merge of ${mainLine} conflicts in ${merge.conflictedFiles.join(', ')}.`);
      return true;
    }
    if (merge.verdict === 'conflicted') {
      await context.hold((hold) => {
        const landing = AirlockReadings.crossingLandingOf(hold.board, AirlockReadings.ticketIdOf(job));
        const part = (landing === null ? null : MergeRun.firstConflictPartOf(landing, merge.conflictedFiles))
          ?? { packageEntity: null, files: merge.conflictedFiles, leavesTheMergeOpen: false };
        context.keepAirlockFacts(job, AirlockAgentHistory.conflictPartFactsOf(part, []));
        launchAirlockAgent(hold, job, 1, AirlockAgentHistory.conflictPartScopeOf(part, AirlockAgentHistory.homeWorkerScopeOf(hold.board, AirlockReadings.ticketIdOf(job))));
        setPhase(hold, job, 'resolving');
      });
      return true;
    }
    await refuseMerge(job, MERGE_REFUSED_CAUSES.gitFailed, merge.verdict === 'git-failed' ? context.mergeDecisionSentenceOf(merge.problem) : 'unknown commit');
    return true;
  }

  return { runMergeIn };
}
