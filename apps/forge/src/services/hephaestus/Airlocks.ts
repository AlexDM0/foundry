/**
 * The Airlocks, one per target, run by Hephaestus after each pass (design section 6): allocation, the one merge-in against the recorded
 * tip, the ticket's last worker resumed for a conflict or a red merged tree, the conditional conflict re-review of a large resolution, the
 * gate on the merged tree and the compare-and-swap landing. The main line lands in the main checkout; a group's tickets and its refreshes
 * land in the group's own worktree, and its release ticket lands the bundle on the main line. Every phase is written on the merge job's
 * slot in its own hold, and every outcome ends the job or opens what User or the Assistant answers, so nothing loops. A ticket that crossed
 * into packages has its conflict and its red merged tree routed to the entity that owns them (strategy 5.7).
 */
import { existsSync } from 'node:fs';

import type { Job }                                                            from '../../domain/tracker-model/@types/Job.ts';
import { INTERRUPTED_HOLD_PREFIX, INTERRUPTED_MERGE_HOLD, PARKED_HOLD_PREFIX } from '../../domain/tracker-model/constants/DecisionAndIncidentVocabulary.ts';
import { INTERRUPTED_APPLY_REASON }                                            from '../../domain/tracker-model/constants/PipelineSetupVocabulary.ts';
import { GitProcess }                                                          from '../../lib/git/GitProcess.ts';
import { MergeRun }                                                            from '../lifecycle/MergeRun.ts';
import type { Airlocks, AirlocksContext, HeldTarget }                          from './@types/Airlocks.ts';
import { MERGE_AGENT_STATES_HOLDING_NO_SLOT }                                  from './AirlockAgentHistory.ts';
import { createAirlockAgents }                                                 from './AirlockAgents.ts';
import { createAirlockAllocation }                                             from './AirlockAllocation.ts';
import { createAirlockLandings }                                               from './AirlockLandings.ts';
import { createAirlockMergeIn }                                                from './AirlockMergeIn.ts';
import { AirlockReadings }                                                     from './AirlockReadings.ts';
import { createAirlockSlots }                                                  from './AirlockSlots.ts';
import { createConstitutionCommitAirlock }                                     from './ConstitutionCommitAirlock.ts';
import { ConstitutionCommits }                                                 from './ConstitutionCommits.ts';
import { createMergedTreeGating }                                              from './MergedTreeGating.ts';
import { createStaleGreenRegates }                                             from './StaleGreenRegates.ts';
import { REQUEUE_CAUSES }                                                      from './constants/AirlockCauses.ts';

/** A sweep stops after this many rounds of advancing and allocating, so a slot that keeps moving waits for the next pass. */
const ROUNDS_PER_SWEEP = 8;

const MERGE_ABORTED_CAUSE = 'merge-aborted';

export function createAirlocks(context: AirlocksContext): Airlocks {
  const { mainLine, branchNames: { groupTargetPrefix } } = context;
  const slots = createAirlockSlots(context);
  const {
    freeSlot, heldTargets, recheckHeldTargets, slotWorktreeOf
  } = slots;
  const agents = createAirlockAgents(context, slots);
  const staleGreens = createStaleGreenRegates(context, slots);
  const { runGate } = createMergedTreeGating(context, slots, agents, staleGreens);
  const { runMergeIn } = createAirlockMergeIn(context, slots, agents);
  const { runLanding, redoReleaseCleanupsOnce } = createAirlockLandings(context, slots);
  const constitutionCommits = createConstitutionCommitAirlock(context, slots);
  const { runConstitutionCommit, runConstitutionLanding, endConstitutionCommit } = constitutionCommits;
  const { allocate } = createAirlockAllocation(context, slots, constitutionCommits);
  const { runAirlockAgent } = agents;
  const { settleTicketsAwaitingGreen } = staleGreens;
  let startOrphansWereLookedAt = false;

  async function advance(job: Readonly<Job>, hasOpenIncident: boolean): Promise<boolean> {
    switch (AirlockReadings.slotOf(job).phase) {
      case 'merge-in':
        return runMergeIn(job);
      case 'resolving':
      case 're-reviewing':
      case 'fixing':
        return runAirlockAgent(job, hasOpenIncident);
      case 'gating':
        return runGate(job, hasOpenIncident);
      case 'committing':
        return runConstitutionCommit(job);
      case 'landing':
        return AirlockReadings.isConstitutionCommit(job) ? runConstitutionLanding(job) : runLanding(job);
    }
  }

  /** A parked candidate, by its incident's `merge abort` default or a `ticket park`, gives up the slot: the merge aborts and it leaves the queue. */
  async function abortParkedMerge(job: Readonly<Job>): Promise<boolean> {
    await freeSlot(job, { outcome: 'stopped', cause: MERGE_ABORTED_CAUSE }, (hold) => {
      job.ticketIds.forEach((ticketId) => hold.board.setTicketMergeQueued(ticketId, false, hold.at));
    });
    return true;
  }

  /** The slot's own child lives, or its agent awaits its spawn, runs or has reported: a start does not cut that holder's work short. */
  function slotHasALiveHolder(job: Readonly<Job>, agent: Readonly<Job> | undefined): boolean {
    if (context.childIsLive(job)) return true;
    return agent !== undefined && (!MERGE_AGENT_STATES_HOLDING_NO_SLOT.has(agent.state) || context.childIsLive(agent));
  }

  /** The target's tip moved past the start tip the slot recorded and holds the commit the slot was landing: only its board side is left. */
  function landingWasMade(job: Readonly<Job>): boolean {
    const slot = AirlockReadings.slotOf(job);
    if (slot.phase !== 'landing') return false;
    const landingWorktree = AirlockReadings.isConstitutionCommit(job) ? ConstitutionCommits.commitWorktreeOf(context.worktreesRoot, job.id) : slotWorktreeOf(job);
    const landingCommit   = existsSync(landingWorktree) ? MergeRun.headOf(landingWorktree) : null;
    const targetTip       = GitProcess.resolvedCommitOf(context.repositoryRoot, `refs/heads/${slot.target}`);
    if (landingCommit === null || targetTip === null || targetTip === slot.targetTip) return false;
    return GitProcess.succeeded(GitProcess.run(context.repositoryRoot, ['merge-base', '--is-ancestor', landingCommit, targetTip]));
  }

  /**
   * As an orphan is freed, but its ticket is held `interrupted:merge` and keeps its merge-queued mark, so User's resume puts it back in the
   * queue with no fresh review; a constitution commit's Apply is held `interrupted` until `resume --all`. A refresh, owed to no ticket and
   * no request, is only freed: the next allocation derives it again from the branches.
   */
  async function holdOrphanedSlot(job: Readonly<Job>): Promise<boolean> {
    if (AirlockReadings.isConstitutionCommit(job)) {
      return endConstitutionCommit(job, { outcome: 'stopped', cause: REQUEUE_CAUSES.orphaned }, (hold, setupId) => {
        hold.board.holdApply(setupId, { reason: INTERRUPTED_APPLY_REASON, blockingFiles: [] }, hold.at);
      });
    }
    await freeSlot(job, { outcome: 'stopped', cause: REQUEUE_CAUSES.orphaned }, (hold) => {
      for (const ticketId of job.ticketIds) {
        if (hold.board.ticketByReference(ticketId)?.frontmatter.hold === undefined) hold.board.holdTicket(ticketId, INTERRUPTED_MERGE_HOLD, hold.at);
      }
    });
    return true;
  }

  /** `slotJobIdsHeldAtTheStart` names the slots the first sweep after a start that waits found; each is looked at once. */
  async function advanceTheSlot(target: string, slotJobIdsHeldAtTheStart: Set<string>): Promise<boolean> {
    const holding = await context.hold((hold) => {
      const job = hold.board.airlockHolderOf(target);
      if (job === undefined) return null;
      const holdOf = (ticketId: string): string | undefined => hold.board.ticketByReference(ticketId)?.frontmatter.hold;
      return {
        job,
        agent:           AirlockReadings.mergeAgentOf(hold.board, job),
        parked:          job.ticketIds.some((ticketId) => holdOf(ticketId)?.startsWith(PARKED_HOLD_PREFIX) === true),
        waitsForResume:  job.ticketIds.some((ticketId) => holdOf(ticketId)?.startsWith(INTERRUPTED_HOLD_PREFIX) === true),
        hasOpenIncident: hold.board.incidents().some((incident) => incident.jobId === job.id),
      };
    });
    if (holding === null || holding.job.airlock === undefined) return false;
    if (holding.waitsForResume) return false;
    if (holding.parked && !holding.hasOpenIncident) return abortParkedMerge(holding.job);
    const foundAtTheStart = slotJobIdsHeldAtTheStart.delete(holding.job.id);
    if (foundAtTheStart && !holding.hasOpenIncident && !slotHasALiveHolder(holding.job, holding.agent) && !landingWasMade(holding.job)) {
      return holdOrphanedSlot(holding.job);
    }
    return advance(holding.job, holding.hasOpenIncident);
  }

  /** The main line, every group with an open ticket, and every target a slot still holds. */
  async function liveTargets(): Promise<string[]> {
    return context.hold((hold) => {
      const targets = new Set([mainLine]);
      for (const { frontmatter } of hold.board.tickets()) {
        if (frontmatter.group !== undefined && frontmatter.status !== 'delivered' && frontmatter.status !== 'abandoned') targets.add(`${groupTargetPrefix}${frontmatter.group}`);
      }
      for (const job of hold.board.jobs()) {
        if ((job.kind === 'merge' || AirlockReadings.isRefresh(job) || AirlockReadings.isConstitutionCommit(job)) && job.target !== null) targets.add(job.target);
      }
      return [...targets];
    });
  }

  /** The slots standing as the first sweep after a start that waits begins, once; a slot this Hephaestus opens later is never among them. */
  async function slotJobIdsHeldAtTheStartOf(): Promise<Set<string>> {
    if (startOrphansWereLookedAt || context.startHoldsOrphans !== true) return new Set();
    startOrphansWereLookedAt = true;
    return context.hold((hold) => new Set(hold.board.jobs().filter((job) => job.airlock !== undefined).map((job) => job.id)));
  }

  async function sweep(): Promise<readonly HeldTarget[]> {
    recheckHeldTargets();
    await redoReleaseCleanupsOnce();
    const slotJobIdsHeldAtTheStart = await slotJobIdsHeldAtTheStartOf();
    for (let round = 0; round < ROUNDS_PER_SWEEP; round += 1) {
      let moved = false;
      for (const target of await liveTargets()) {
        const advanced  = await advanceTheSlot(target, slotJobIdsHeldAtTheStart);
        const regated   = await settleTicketsAwaitingGreen(target);
        const allocated = await allocate(target);
        moved = moved || advanced || regated || allocated;
      }
      if (!moved) break;
    }
    return [...heldTargets.values()];
  }

  return { sweep };
}
