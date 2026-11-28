/**
 * The `landing` phase of a ticket or a refresh: the compare-and-swap fast-forward of the target and what the board records of it, a moved
 * or held target, and the cleanup after a refresh or a release.
 */
import type { DecisionKind }                    from '../../domain/tracker-model/@types/Decision.ts';
import type { Job }                             from '../../domain/tracker-model/@types/Job.ts';
import type { Board }                           from '../../domain/tracker-model/Board.ts';
import { PARKED_HOLD_PREFIX }                   from '../../domain/tracker-model/constants/DecisionAndIncidentVocabulary.ts';
import { PipelineUtil }                         from '../../domain/tracker-model/utils/PipelineUtil.ts';
import { GitProcess }                           from '../../lib/git/GitProcess.ts';
import { LANDING_OUTCOME_OF_REFUSAL, Landing }  from '../lifecycle/Landing.ts';
import { MergeRun }                             from '../lifecycle/MergeRun.ts';
import type { AirlockLandings, AirlockSlots }   from './@types/AirlockParts.ts';
import type { AirlockHold, AirlocksContext }    from './@types/Airlocks.ts';
import { AirlockReadings }                      from './AirlockReadings.ts';
import { GroupWorktrees }                       from './GroupWorktrees.ts';
import { MERGE_REFUSED_CAUSES, REQUEUE_CAUSES } from './constants/AirlockCauses.ts';

const LANDING_REFUSED_DECISION: DecisionKind = 'landing-refused';

/** The ticket's trailing run of merge jobs ended by an unrecorded target move: what parks it after TARGET_MOVED_MERGES_BEFORE_PARKING. */
function targetMovesInARowOf(board: Board, ticketId: string): number {
  const mergeJobIds = new Set<string>();
  let movesInARow = 0;
  for (const record of board.logRecordsSoFar()) {
    if (record.kind === 'job-launched' && record.fields.kind === 'merge' && record.fields.ticketIds.includes(ticketId)) mergeJobIds.add(record.jobId);
    if (record.kind !== 'job-ended' || !mergeJobIds.has(record.jobId)) continue;
    movesInARow = record.fields.cause === REQUEUE_CAUSES.targetMoved ? movesInARow + 1 : 0;
  }
  return movesInARow;
}

export function createAirlockLandings(context: AirlocksContext, slots: AirlockSlots): AirlockLandings {
  const { mainLine, branchNames: { groupTargetPrefix } } = context;
  const {
    freeSlot, groupOf, holdTarget, openDecision, refuseMerge, removeRefreshWorktree, sharedLanding, slotWorktreeOf
  } = slots;
  let releaseCleanupsWereRedone = false;

  /** Main lands in the main checkout; a group branch in its own worktree, created from the main line's tip when the group has none yet. */
  function targetDirectoryOf(target: string): string | null {
    if (target === mainLine) return context.repositoryRoot;
    const prepared = GroupWorktrees.prepareGroupWorktree(context.repositoryRoot, context.worktreesRoot, target, mainLine);
    return prepared.verdict === 'ready' ? prepared.path : null;
  }

  /** What the landing does on the board once git moved the target: deliver, approve a group's ticket, or record a refresh. */
  function landOnTheBoard(hold: AirlockHold, job: Readonly<Job>, commit: string): void {
    const slot     = AirlockReadings.slotOf(job);
    const ticketId = AirlockReadings.ticketIdOf(job);
    if (AirlockReadings.isRefresh(job)) {
      hold.board.recordMergeLanded(job.id, { target: slot.target, commit, kind: 'integrated' }, hold.at);
      hold.board.endJob(job.id, { outcome: 'refreshed', commit }, hold.at);
      return;
    }
    if (slot.target !== mainLine) {
      hold.board.moveTicket(ticketId, 'reviewed', { checksLegality: true }, hold.at);
      hold.board.recordMergeLanded(job.id, { target: slot.target, commit, kind: 'integrated' }, hold.at);
      hold.board.endJob(job.id, { outcome: 'integrated', commit }, hold.at);
      return;
    }
    const tickets  = hold.board.tickets();
    const group    = tickets.find((candidate) => candidate.frontmatter.id === ticketId)?.frontmatter.group;
    // The bundle's integrated tickets go with the release; one delivered already stays as it is.
    const released = group === undefined ? [] : hold.board.releaseBundleTicketIdsOf(group).filter((bundleTicketId) => (
      bundleTicketId !== ticketId && tickets.some((candidate) => candidate.frontmatter.id === bundleTicketId && candidate.frontmatter.status === 'reviewed')
    ));
    hold.board.releaseTickets([ticketId, ...released], { branch: context.branchNames.ticketBranchOf(ticketId), commit }, hold.at);
    hold.board.recordMergeLanded(job.id, { target: mainLine, commit, kind: 'landed' }, hold.at);
    hold.board.endJob(job.id, { outcome: 'landed', commit }, hold.at);
  }

  function removeReleasedGroup(releasedGroup: string): void {
    const groupBranch = `${groupTargetPrefix}${releasedGroup}`;
    const problem     = GroupWorktrees.removeGroup(context.repositoryRoot, context.worktreesRoot, groupBranch);
    if (problem !== null) context.reportDeclinedCleanup({ cleanup: 'release', groupBranch, problem });
  }

  /** After the landing hold: a refresh's temporary worktree goes, and a release removes the group's worktree and deletes its branch. */
  function cleanUpAfterLanding(job: Readonly<Job>, releasedGroup: string | undefined): void {
    if (AirlockReadings.isRefresh(job)) removeRefreshWorktree(job);
    if (releasedGroup !== undefined) removeReleasedGroup(releasedGroup);
  }

  /** The groups a delivered ticket released, but a group that an open ticket or a job still targets: its branch is in use again. */
  function releasedGroupsOf(board: Board): string[] {
    const groupsInUse = new Set<string>();
    const releasedGroups = new Set<string>();
    for (const { frontmatter } of board.tickets()) {
      if (frontmatter.group === undefined) continue;
      if (frontmatter.status !== 'delivered' && frontmatter.status !== 'abandoned') groupsInUse.add(frontmatter.group);
      if (frontmatter.status === 'delivered' && frontmatter.releasesGroup === true) releasedGroups.add(frontmatter.group);
    }
    for (const job of board.jobs()) if (job.target?.startsWith(groupTargetPrefix) === true) groupsInUse.add(groupOf(job.target));
    return [...releasedGroups].filter((group) => !groupsInUse.has(group));
  }

  /**
   * A stop after a release's landing hold and before its cleanup leaves the group's worktree and branch, which no job runs again: the first
   * sweep after any start removes them once more. A group already gone is passed over.
   */
  async function redoReleaseCleanupsOnce(): Promise<void> {
    if (releaseCleanupsWereRedone) return;
    releaseCleanupsWereRedone = true;
    for (const releasedGroup of await context.hold((hold) => releasedGroupsOf(hold.board))) {
      if (GitProcess.resolvedCommitOf(context.repositoryRoot, `refs/heads/${groupTargetPrefix}${releasedGroup}`) !== null) removeReleasedGroup(releasedGroup);
    }
  }

  async function runLanding(job: Readonly<Job>): Promise<boolean> {
    const ticketId     = AirlockReadings.ticketIdOf(job);
    const slot         = AirlockReadings.slotOf(job);
    const mergedCommit = MergeRun.headOf(slotWorktreeOf(job));
    const directory    = targetDirectoryOf(slot.target);
    if (mergedCommit === null || directory === null) {
      await refuseMerge(job, MERGE_REFUSED_CAUSES.gitFailed, mergedCommit === null ? 'The merged commit cannot be read.' : `The ${slot.target} worktree cannot be prepared.`);
      return true;
    }
    let releasedGroup: string | undefined = undefined;
    const landed = await context.hold((hold) => {
      const ticket = hold.board.tickets().find((candidate) => candidate.frontmatter.id === ticketId);
      // Only a review accounts for the Acceptance: a pipeline without a review phase lands on its gates alone.
      const pipeline = hold.board.pipeline();
      const acceptanceIsReviewed = pipeline === null || PipelineUtil.ticketReviewIsSet(pipeline, ticket?.frontmatter.entity);
      const ticketRefusal = ticket === undefined || !acceptanceIsReviewed ? null : Landing.ticketRefusalOf([ticket], hold.board);
      if (ticketRefusal !== null) return ticketRefusal;
      const verdict = Landing.landOnTarget({
        target:            { branch: slot.target, directory },
        mergedCommit,
        expectedTargetTip: slot.targetTip,
        recordedLandings:  hold.board.recordedLandingsOn(slot.target),
        hookPolicy:        'hooks-off',
        ...sharedLanding,
      });
      if (verdict.verdict === 'refused') return verdict;
      if (slot.target === mainLine && ticket?.frontmatter.releasesGroup === true) releasedGroup = ticket.frontmatter.group;
      landOnTheBoard(hold, job, verdict.commit);
      return verdict;
    });
    if (landed.verdict !== 'refused') {
      cleanUpAfterLanding(job, releasedGroup);
      return true;
    }
    switch (LANDING_OUTCOME_OF_REFUSAL[landed.reason]) {
      case 'wait-for-the-landing-lock':
        return false;
      case 'requeue-from-branch-tip':
        await freeSlot(job, { outcome: 'stopped', cause: 'target-moved-by-a-recorded-landing' });
        return true;
      case 'open-target-moved':
        return settleMovedTarget(job, landed.facts.targetTip ?? '');
      case 'hold-target':
        holdTarget({
          target: slot.target, branch: AirlockReadings.currentBranchIn(directory), blockingFiles: landed.facts.blockingFiles ?? [], heldFiles: landed.facts.heldFiles ?? []
        }, mergedCommit);
        await freeSlot(job, { outcome: 'stopped', cause: REQUEUE_CAUSES.targetHeld });
        return true;
      case 'hold-ticket':
        await freeSlot(job, { outcome: 'failed', cause: landed.reason }, (hold) => {
          hold.board.setTicketMergeQueued(ticketId, false, hold.at);
          hold.board.holdTicket(ticketId, `${LANDING_REFUSED_DECISION}:${landed.reason}`, hold.at);
          openDecision(hold, LANDING_REFUSED_DECISION, [ticketId], landed.reason);
        });
        return true;
      case 'finish-board-side':
        return true;
    }
  }

  /** Requeued silently while the ref denies hold, parked after TARGET_MOVED_MERGES_BEFORE_PARKING moves in a row; else one decision per tip. */
  async function settleMovedTarget(job: Readonly<Job>, newTip: string): Promise<boolean> {
    const ticketId = AirlockReadings.ticketIdOf(job);
    if (!context.refDeniesHold) {
      return context.hold((hold) => {
        if (hold.board.decisions().some((decision) => decision.kind === 'target-moved' && decision.context === newTip)) return false;
        openDecision(hold, 'target-moved', [], newTip);
        return true;
      });
    }
    await freeSlot(job, { outcome: 'stopped', cause: REQUEUE_CAUSES.targetMoved }, (hold) => {
      if (AirlockReadings.isRefresh(job) || targetMovesInARowOf(hold.board, ticketId) < context.limits.TARGET_MOVED_MERGES_BEFORE_PARKING) return;
      hold.board.holdTicket(ticketId, `${PARKED_HOLD_PREFIX}target-moved`, hold.at);
      openDecision(hold, 'parked', [ticketId], REQUEUE_CAUSES.targetMoved);
    });
    return true;
  }

  return { runLanding, redoReleaseCleanupsOnce };
}
