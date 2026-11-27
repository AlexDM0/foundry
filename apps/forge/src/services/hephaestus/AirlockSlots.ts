/**
 * The slot operations every Airlock phase shares: the target rule, the targets a landing found held, and a slot's decision, phase,
 * freeing and refusal.
 */
import type { DecisionKind }                             from '../../domain/tracker-model/@types/Decision.ts';
import type { Job, JobEnding, AirlockPhase }             from '../../domain/tracker-model/@types/Job.ts';
import type { DecisionDraft }                            from '../../domain/tracker-model/@types/PlaybookStep.ts';
import type { BranchTreeOf, MergeTargetOf }              from '../../domain/tracker-model/AirlockClaims.ts';
import { MergeRun }                                      from '../lifecycle/MergeRun.ts';
import type { AirlockSlots }                             from './@types/AirlockParts.ts';
import type { AirlockHold, AirlocksContext, HeldTarget } from './@types/Airlocks.ts';
import {
  currentBranchIn,
  isRefresh,
  mergeAgentOf,
  pathsTheFastForwardChangesOf,
  slotOf,
  ticketIdOf,
  treeOfCommit,
  uncommittedPathsOf
} from './AirlockReadings.ts';
import { GroupWorktrees } from './GroupWorktrees.ts';

/** A refused refresh names no ticket: its `merge-refused` context starts with the group's target, which keeps the next refresh waiting. */
export const REFRESH_REFUSAL_SEPARATOR = ': ';

export function createAirlockSlots(context: AirlocksContext): AirlockSlots {
  const { mainLine, branchNames: { groupTargetPrefix } } = context;
  const targetOf: MergeTargetOf = (ticket) => (
    ticket.group === undefined || ticket.releasesGroup === true ? mainLine : `${groupTargetPrefix}${ticket.group}`
  );
  const groupOf = (target: string): string => target.slice(groupTargetPrefix.length);
  const branchTreeOf: BranchTreeOf = (ticketId) => treeOfCommit(context.repositoryRoot, `refs/heads/${context.branchNames.ticketBranchOf(ticketId)}`);
  const heldTargets = new Map<string, HeldTarget>();
  /** The commit a held main line of a project tracker could not land: only the paths its fast-forward changes keep the line held. */
  const commitsAHeldMainLineWaitsToLand = new Map<string, string>();
  const sharedLanding = context.sharedRepository === undefined ? {} : { sharedRepository: context.sharedRepository };

  function holdTarget(heldTarget: HeldTarget, commitItWaitsToLand: string): void {
    heldTargets.set(heldTarget.target, heldTarget);
    if (context.sharedRepository !== undefined && heldTarget.target === mainLine) commitsAHeldMainLineWaitsToLand.set(heldTarget.target, commitItWaitsToLand);
  }

  function slotWorktreeOf(job: Readonly<Job>): string {
    return isRefresh(job) ? GroupWorktrees.refreshWorktreeOf(context.worktreesRoot, job.target ?? '') : context.worktreeOf(ticketIdOf(job));
  }

  function openDecision(hold: AirlockHold, kind: DecisionKind, ticketIds: readonly string[], decisionContext: string): void {
    const draft: DecisionDraft = { kind, ticketIds, jobId: null };
    hold.board.openDecision({
      ...draft, askedBy: 'hephaestus', requestId: null, questions: context.decisionWordingOf(draft).questions, context: decisionContext
    }, hold.at);
  }

  function setPhase(hold: AirlockHold, job: Readonly<Job>, phase: AirlockPhase): void {
    hold.board.setJobSlot(job.id, { ...slotOf(job), phase });
  }

  function removeRefreshWorktree(job: Readonly<Job>): void {
    const problem = GroupWorktrees.removeWorktree(context.repositoryRoot, slotWorktreeOf(job));
    if (problem !== null) context.reportDeclinedCleanup({ cleanup: 'refresh', groupBranch: job.target ?? '', problem });
  }

  /** Frees the slot with the worktree back at its recorded start, a refresh's removed; the ticket stays queued unless the caller took it out. */
  async function freeSlot(job: Readonly<Job>, ending: JobEnding, inHold: (hold: AirlockHold) => void = () => undefined): Promise<void> {
    const worktree = slotWorktreeOf(job);
    await context.stopMergedTreeGatesIn(worktree);
    MergeRun.restoreBranchTip(worktree, MergeRun.sidesOf(job, slotOf(job)).startTip);
    if (isRefresh(job)) removeRefreshWorktree(job);
    await context.hold((hold) => {
      const agent = mergeAgentOf(hold.board, job);
      if (agent !== undefined) hold.board.endJob(agent.id, { outcome: 'stopped', cause: ending.cause ?? 'merge-ended' }, hold.at);
      hold.board.endJob(job.id, ending, hold.at);
      inHold(hold);
    });
  }

  /** The merge aborts, the slot frees and User is asked; a `reportKind` also opens the Assistant's incident, with no job waiting. */
  async function refuseMerge(job: Readonly<Job>, cause: string, notes: string, reportKind: unknown = null): Promise<void> {
    const ticketIds = isRefresh(job) ? [] : [ticketIdOf(job)];
    await freeSlot(job, { outcome: 'failed', cause }, (hold) => {
      ticketIds.forEach((ticketId) => hold.board.setTicketMergeQueued(ticketId, false, hold.at));
      openDecision(hold, 'merge-refused', ticketIds, isRefresh(job) ? `${job.target ?? ''}${REFRESH_REFUSAL_SEPARATOR}${notes}` : notes);
      if (reportKind !== 'malformed-ticket' && reportKind !== 'system-blocker') return;
      hold.board.openIncident({
        kind:        reportKind === 'malformed-ticket' ? 'malformed-ticket' : 'system-question',
        ticketIds,
        jobId:       null,
        facts:       { notes, mergeJobId: job.id },
        defaultMove: 'incident-escalate',
      }, hold.at);
    });
  }

  /**
   * A project tracker's main line is shared with its siblings and the people working beside them, so a file its fast-forward does not
   * change never holds it; any other target waits for nothing uncommitted at all. A question git cannot answer keeps the target held.
   */
  function heldTargetIsClear(target: string, directory: string): boolean {
    if (currentBranchIn(directory) !== target) return false;
    const uncommittedPaths = uncommittedPathsOf(directory);
    if (uncommittedPaths === null) return false;
    const commitItWaitsToLand = commitsAHeldMainLineWaitsToLand.get(target);
    if (commitItWaitsToLand === undefined) return uncommittedPaths.length === 0;
    const changedPaths = pathsTheFastForwardChangesOf(directory, commitItWaitsToLand);
    return changedPaths !== null && !uncommittedPaths.some((path) => changedPaths.includes(path));
  }

  /** Rechecked every sweep: each held target's checkout back on its branch and clean where it must be clears its notice. */
  function recheckHeldTargets(): void {
    for (const target of [...heldTargets.keys()]) {
      const directory = target === mainLine ? context.repositoryRoot : GroupWorktrees.groupWorktreeOf(context.worktreesRoot, target);
      if (!heldTargetIsClear(target, directory)) continue;
      heldTargets.delete(target);
      commitsAHeldMainLineWaitsToLand.delete(target);
    }
  }

  return {
    targetOf,
    groupOf,
    branchTreeOf,
    heldTargets,
    sharedLanding,
    holdTarget,
    recheckHeldTargets,
    slotWorktreeOf,
    openDecision,
    setPhase,
    removeRefreshWorktree,
    freeSlot,
    refuseMerge,
  };
}
