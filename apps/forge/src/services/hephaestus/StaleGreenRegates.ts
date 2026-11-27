/**
 * Outside any slot: a queued ticket whose green went stale is gated again beside the pass, and its red goes back to the agent that made
 * it, or a crossing ticket's to the entity that owns the red gate; a current green that is not queued is queued.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join }                     from 'node:path';

import type { MergedTreeGate }                                        from '../../adapters/gate-outcome/@types/MergedTreeGate.ts';
import type { GatePhase }                                             from '../../domain/tracker-model/@types/GatePhase.ts';
import type { EntityKey }                                             from '../../domain/tracker-model/@types/Pipeline.ts';
import type { Board }                                                 from '../../domain/tracker-model/Board.ts';
import { PARKED_HOLD_PREFIX }                                         from '../../domain/tracker-model/constants/DecisionAndIncidentVocabulary.ts';
import { GitProcess }                                                 from '../../lib/git/GitProcess.ts';
import { RED_HANDOFF_RESUME_CALL_BUDGET }                             from '../../shared/constants/HephaestusLimits.ts';
import { MergeRun, type RedGateOwner }                                from '../lifecycle/MergeRun.ts';
import type { AirlockSlots, StaleGreenRed, StaleGreenRegates }        from './@types/AirlockParts.ts';
import type { AirlockHold, AirlocksContext }                          from './@types/Airlocks.ts';
import { crossingLandingOf, redGateOf, tailOf }                       from './AirlockReadings.ts';
import { gateRanFieldsOf, MERGE_GATE_INCIDENT_KINDS, recordStepRuns } from './MergedTreeGating.ts';
import { RED_HANDOFF_FILES, RedHandoff }                              from './RedHandoff.ts';
import { RED_RESUMES_SPENT_CAUSE }                                    from './constants/AirlockCauses.ts';

const STALE_GREEN_LOG_FILE = 'gate.log';

/**
 * The phase a stale green is gated again in: the one it was taken in, or, on a row that names none, the phase whose green queues the
 * ticket (review with a review phase, build without one).
 */
function regatePhaseOf(board: Board, ticketId: string): GatePhase {
  return board.greenPhaseOf(ticketId) ?? (board.reviewIsSetFor(ticketId) ? 'review' : 'build');
}

/** A stale green is gated again by its ticket's own entity, or by every entity when the ticket names none the pipeline holds. */
function staleGreenGatedEntitiesOf(board: Board, ticketId: string): readonly EntityKey[] | undefined {
  const entities = board.pipeline()?.entities;
  if (entities === undefined) return undefined;
  const entityKey = board.tickets().find((ticket) => ticket.frontmatter.id === ticketId)?.frontmatter.entity;
  return entityKey !== undefined && Object.hasOwn(entities, entityKey) ? [entityKey] : Object.keys(entities);
}

export function createStaleGreenRegates(context: AirlocksContext, slots: AirlockSlots): StaleGreenRegates {
  const { branchTreeOf, openDecision, targetOf } = slots;

  /**
   * The newest ended job of the kind the policy launches next for a stale green outside the Airlock: its reviewer, or its builder with no
   * review step. Unlike the Airlock's last worker, this follows the pipeline, since that next session is the one taking the handoff over. A
   * crossing ticket sent back from its landing names the build kind: its package's or its home's builder takes the handoff over.
   */
  function newestAgentJobIdOf(board: Board, ticketId: string, kind: 'build' | 'review' = board.reviewIsSetFor(ticketId) ? 'review' : 'build'): string | null {
    const agentJobIds = new Set<string>();
    let newest: string | null = null;
    for (const record of board.logRecordsSoFar()) {
      if (record.kind === 'job-launched' && record.fields.kind === kind && record.fields.ticketIds.includes(ticketId)) agentJobIds.add(record.jobId);
      if (record.kind === 'job-ended' && agentJobIds.has(record.jobId)) newest = record.jobId;
    }
    return newest;
  }

  /**
   * The red handoff the next session of that agent's kind takes over, kept in the ended job's folder. It is one more resume of that job's own
   * ladder; past the resumes allowed, or on a ladder whose facts cannot be read, nothing is written, and the answer is false.
   */
  function writeStaleGreenHandoff(board: Board, ticketId: string, red: StaleGreenRed, takenOverByABuild = false): boolean {
    const jobId = takenOverByABuild ? newestAgentJobIdOf(board, ticketId, 'build') : newestAgentJobIdOf(board, ticketId);
    if (jobId === null) return true;
    const ended = RedHandoff.redHandoffReadingOf(context.jobFolderOfId(jobId));
    // No live job holds the facts, so no incident can: a ladder that cannot be counted fails closed as one spent, and the ticket parks.
    if (ended.verdict === 'unreadable') return false;
    const resume = (ended.verdict === 'readable' ? ended.facts.resume : 0) + 1;
    if (resume > context.redHandoffResumes) return false;
    const folder = join(context.jobFolderOfId(jobId), RED_HANDOFF_FILES.staleGreenFolder);
    const pipelineGate = redGateOf(board.pipeline(), red.entity, red.step);
    mkdirSync(folder, { recursive: true });
    writeFileSync(join(folder, STALE_GREEN_LOG_FILE), `${red.step}\n${red.output}`);
    RedHandoff.writeRedHandoff(folder, {
      kind:                'gate',
      name:                red.step,
      command:             pipelineGate?.run ?? null,
      fixCommand:          pipelineGate?.fix ?? null,
      commit:              red.commit,
      exitCode:            null,
      gateFailureNotePath: RedHandoff.gateFailureNotePathOf(folder),
      fullLogPath:         join(folder, STALE_GREEN_LOG_FILE),
      resume,
      resumesAllowed:      context.redHandoffResumes,
      callBudget:          RED_HANDOFF_RESUME_CALL_BUDGET,
      interruptedInstance: 0,
    }, red.output);
    return true;
  }

  /** A stale green that turned red goes back to the agent that made it while its ladder has resumes left; past them the ticket parks. */
  function returnStaleGreenRed(hold: AirlockHold, ticketId: string, red: StaleGreenRed): void {
    if (!writeStaleGreenHandoff(hold.board, ticketId, red)) {
      hold.board.holdTicket(ticketId, `${PARKED_HOLD_PREFIX}${RED_RESUMES_SPENT_CAUSE}`, hold.at);
      openDecision(hold, 'parked', [ticketId], tailOf(red.output, context.limits.CHECK_OUTPUT_TAIL_LINES));
      return;
    }
    // Without a review phase the branch's own green would queue it again at once, with no agent to fix it: its builder takes it back.
    if (!hold.board.reviewIsSetFor(ticketId)) hold.board.moveTicket(ticketId, 'in-progress', { checksLegality: true }, hold.at);
  }

  /** In the hold after a gate run outside the Airlock: green queues the ticket again, red returns it to its agent, else an incident holds it. */
  function settleRegate(hold: AirlockHold, ticketId: string, target: string, treeId: string, gate: MergedTreeGate): void {
    const ticket = hold.board.tickets().find((candidate) => candidate.frontmatter.id === ticketId);
    const stillWaits = ticket?.frontmatter.status === 'in-review' && ticket.frontmatter.hold === undefined
      && !hold.board.jobs().some((job) => job.ticketIds.includes(ticketId)) && branchTreeOf(ticketId) === treeId;
    if (!stillWaits) return;
    recordStepRuns(hold, gate);
    if (gate.outcome !== 'setup-failed' && gate.outcome !== 'sandbox-unavailable') hold.board.recordGateRan(gateRanFieldsOf(treeId, gate.outcome, gate.cacheReports), hold.at);
    hold.board.recordPipelineJudgedBy(ticketId, gate.outcome === 'passed' ? treeId : null, gate.stamp, hold.at);
    if (gate.outcome === 'passed') {
      // A pipeline changed while the gates ran leaves this green not current: the ticket waits unqueued, and the next sweep gates it again.
      if (hold.board.greenIsCurrent(ticketId, treeId, hold.board.greenPhaseOf(ticketId))) hold.board.queueTicketForMerge(ticketId, target, treeId, hold.at);
      return;
    }
    if (gate.outcome === 'failed') {
      // With a review phase the ticket waits in review, unqueued, for its next reviewer; without one its builder takes the red handoff. A
      // crossing ticket goes back to the stage of the entity that owns the red gate (E65).
      const branchRef = `refs/heads/${context.branchNames.ticketBranchOf(ticketId)}`;
      const red: StaleGreenRed = {
        treeId,
        step:   gate.step ?? '',
        ...(gate.entity === undefined ? {} : { entity: gate.entity }),
        output: gate.output,
        commit: GitProcess.resolvedCommitOf(context.repositoryRoot, branchRef) ?? '',
      };
      const landing = crossingLandingOf(hold.board, ticketId);
      if (landing === null) returnStaleGreenRed(hold, ticketId, red);
      else returnRedGateToItsOwner(hold, ticketId, { owner: MergeRun.redGateOwnerOf(landing, gate.entity), homeEntity: landing.homeEntity }, red);
      return;
    }
    hold.board.openIncident({
      kind:        MERGE_GATE_INCIDENT_KINDS[gate.outcome],
      ticketIds:   [ticketId],
      jobId:       null,
      facts:       { tree: treeId, gate: gate.step ?? '' },
      defaultMove: gate.outcome === 'setup-failed' ? 'worktree-repair' : 'gate-retry',
    }, hold.at);
  }

  /**
   * Outside any slot: a queued ticket whose green went stale loses its mark and its worktree is gated again; a ticket whose green is current
   * but which is not queued (no review phase) is queued. While the re-gate runs beside the pass the ticket keeps its mark: a stale green
   * is no merge candidate, and the mark keeps the policy from launching a reviewer and the next sweep listing the ticket for its outcome.
   */
  async function settleTicketsAwaitingGreen(target: string): Promise<boolean> {
    if (context.dispatchIsStopped()) return false;
    // With no stored pipeline only a constitution commit uses the Airlock: no ticket is gated or queued.
    const awaiting = await context.hold((hold) => (hold.board.pipeline() === null ? [] : hold.board.ticketsAwaitingGreenOf(target, targetOf, branchTreeOf)));
    let moved = false;
    for (const { ticketId } of awaiting) {
      const settled = await context.hold((hold) => {
        const branchTree    = branchTreeOf(ticketId);
        const phase         = regatePhaseOf(hold.board, ticketId);
        const gatedEntities = staleGreenGatedEntitiesOf(hold.board, ticketId);
        if (!hold.board.greenIsCurrent(ticketId, branchTree, hold.board.greenPhaseOf(ticketId))) return {
          greenIsCurrent: false, changed: false, phase, gatedEntities
        };
        if (hold.board.ticketIsMergeQueued(ticketId)) return {
          greenIsCurrent: true, changed: false, phase, gatedEntities
        };
        hold.board.queueTicketForMerge(ticketId, target, branchTree, hold.at);
        return {
          greenIsCurrent: true, changed: true, phase, gatedEntities
        };
      });
      moved = moved || settled.changed;
      if (settled.greenIsCurrent) continue;
      // Only a worktree whose HEAD is the branch's tree is gated. An ungated ticket waits unqueued: with a review phase the policy launches
      // its next reviewer, without one the next sweep lists it again.
      const worktree = context.worktreeOf(ticketId);
      const treeId   = MergeRun.treeOf(worktree);
      const gate     = treeId === null || treeId !== branchTreeOf(ticketId) ? null : context.mergedTreeGateOf(worktree, treeId, settled.phase, settled.gatedEntities, null);
      if (gate === 'running') continue;
      const unqueued = await context.hold((hold) => {
        const wasQueued = hold.board.ticketIsMergeQueued(ticketId);
        if (wasQueued) hold.board.setTicketMergeQueued(ticketId, false, hold.at);
        if (gate !== null && treeId !== null) settleRegate(hold, ticketId, target, treeId, gate);
        return wasQueued;
      });
      moved = moved || unqueued || gate !== null;
      if (gate !== null && treeId !== null) context.mergedTreeGateSettled(worktree, treeId, settled.phase, settled.gatedEntities, gate);
    }
    return moved;
  }

  /**
   * In the hold: a crossing ticket's red gate, on its merged tree or on its stale green, goes to the entity that owns the gate (E65). The
   * ticket returns to the package's build, its seal lifted and the return counted, or to the home's `adapt`, and that stage's builder takes
   * the red handoff over. A second package return opens `second-return`, naming the package, and the ticket keeps its stage and status
   * (E45); a red gate past the builder's resumes parks the ticket for User.
   */
  function returnRedGateToItsOwner(hold: AirlockHold, ticketId: string, route: Readonly<{ owner: RedGateOwner; homeEntity: EntityKey }>, red: StaleGreenRed): void {
    const { owner } = route;
    if (owner.owner === 'package' && hold.board.returnToThePackageIsASecondReturn(ticketId, owner.packageEntity)) {
      hold.board.returnTicketToThePackage(ticketId, owner.packageEntity, context.decisionWordingOf, hold.at);
      return;
    }
    if (!writeStaleGreenHandoff(hold.board, ticketId, red, true)) {
      hold.board.holdTicket(ticketId, `${PARKED_HOLD_PREFIX}${RED_RESUMES_SPENT_CAUSE}`, hold.at);
      openDecision(hold, 'parked', [ticketId], tailOf(red.output, context.limits.CHECK_OUTPUT_TAIL_LINES));
      return;
    }
    if (owner.owner === 'package') hold.board.returnTicketToThePackage(ticketId, owner.packageEntity, context.decisionWordingOf, hold.at);
    else hold.board.moveTicketStage(ticketId, { name: 'adapt', entity: route.homeEntity }, hold.at);
    hold.board.moveTicket(ticketId, 'in-progress', { checksLegality: true }, hold.at);
  }

  return { settleTicketsAwaitingGreen, returnRedGateToItsOwner };
}
