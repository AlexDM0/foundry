/**
 * The `gating` phase: the gate of a slot's merged tree, which lands it, resumes the ticket's last worker with its red, returns a crossing
 * ticket's red to the entity that owns it, or parks the merge; and what a merged tree's gate run records.
 */
import type { MergedTreeGate }                        from '../../adapters/gate-outcome/@types/MergedTreeGate.ts';
import type { GateOutcome, GateRunCacheReports, Job } from '../../domain/tracker-model/@types/Job.ts';
import type { LogRecordFieldsOf }                     from '../../domain/tracker-model/@types/LogRecord.ts';
import type { EntityKey }                             from '../../domain/tracker-model/@types/Pipeline.ts';
import type { Board }                                 from '../../domain/tracker-model/Board.ts';
import { PARKED_HOLD_PREFIX }                         from '../../domain/tracker-model/constants/DecisionAndIncidentVocabulary.ts';
import { EntityOwnershipUtil, type PipelineEntities } from '../../domain/tracker-model/utils/EntityOwnershipUtil.ts';
import { MergeRun, type RedGateOwner }                from '../lifecycle/MergeRun.ts';
import type {
  AirlockAgents,
  AirlockSlots,
  MergedTreeGating,
  StaleGreenRed,
  StaleGreenRegates
} from './@types/AirlockParts.ts';
import type { AirlockHold, AirlocksContext } from './@types/Airlocks.ts';
import { AirlockReadings }                   from './AirlockReadings.ts';
import { MERGE_REFUSED_CAUSES }              from './constants/AirlockCauses.ts';

export function gateRanFieldsOf(tree: string, outcome: GateOutcome, cacheReports: GateRunCacheReports | undefined): LogRecordFieldsOf<'gate-ran'> {
  return {
    tree, outcome, cached: false, ...(cacheReports === undefined ? {} : { cacheReports })
  };
}

/** Each step line of a merged-tree gate that ran, with its run time, in the hold that consumes the gate; a run that ran no line records none. */
export function recordStepRuns(hold: AirlockHold, gate: MergedTreeGate): void {
  if (gate.stepRuns !== undefined) hold.board.recordPipelineStepsRan(gate.stepRuns.steps, gate.stepRuns.phase, hold.at);
}

/** A red gate goes back to the ticket's agent; a gate that could not run and a failed prepare step are the incidents a build job opens too. */
export const MERGE_GATE_INCIDENT_KINDS = { 'cannot-run': 'gate-cannot-run', 'setup-failed': 'setup-failed', 'sandbox-unavailable': 'sandbox-unavailable' } as const;

/** A ticket's merged tree that is its branch tip's own tree: the merge-in changed nothing. A refresh has no branch of its own. */
function mergedTreeIsTheBranchTree(worktree: string, job: Readonly<Job>, treeId: string): boolean {
  const branchTip = job.airlock?.branchTip;
  return job.ticketIds.length > 0 && branchTip !== undefined && AirlockReadings.treeOfCommit(worktree, branchTip) === treeId;
}

/**
 * The merged tree is the branch's own tree, the newest gate run on it passed, and the ticket's row holds it as a green current in the merge
 * phase: the merge changed nothing the gates judged, and the gates that passed it are the merge phase's. On a pipeline with entities that
 * green also names every entity of the landing's gate set. A refresh has no row, so its merged tree is always gated.
 */
function mergedTreeWasLastPassed(
  board: Board, job: Readonly<Job>, treeId: string, isTheBranchTree: boolean, landingGatedEntities: readonly EntityKey[] = []
): boolean {
  const [ticketId] = job.ticketIds;
  if (!isTheBranchTree || ticketId === undefined) return false;
  const newestRunOnTheTree = board.logRecordsSoFar().findLast((record) => record.kind === 'gate-ran' && record.fields.tree === treeId);
  return newestRunOnTheTree?.kind === 'gate-ran' && newestRunOnTheTree.fields.outcome === 'passed'
    && board.greenIsCurrent(ticketId, treeId, 'merge', landingGatedEntities);
}

/** The parked hold a merged tree leaves when it is still red after the agent's resumes. */
const MERGE_GATE_RED_PARK_CAUSE = 'merge-gate-red';

/** How a crossing ticket's merge job ends when its red merged tree sends the ticket back to the package's or the home's stage (E65). */
const RED_GATE_RETURN_CAUSES = { package: 'package-gate-red', home: 'home-gate-red' } as const satisfies Readonly<Record<RedGateOwner['owner'], string>>;

/** What a merged tree's gate leaves the Airlock to do outside its hold. */
type RedMergedTreeSettlement =
  | { verdict: 'settled' }
  | { verdict: 'park' }
  | { verdict: 'return-to-owner'; owner: RedGateOwner; homeEntity: EntityKey };

/**
 * The landing's gate set: the entities the fast-forward to the merged tree changes and their consumers. On a group's branch only the
 * entities it changes: their consumers run at the group's release, which lands all of it on the main line (E68). When git cannot name the
 * paths, or a group's landing changes no entity's paths, every entity's gates run.
 */
function landingGatedEntitiesOf(entities: PipelineEntities, worktree: string, targetTip: string, landsOnTheMainLine: boolean): readonly EntityKey[] {
  const changedPaths = AirlockReadings.pathsTheFastForwardChangesOf(worktree, targetTip);
  if (changedPaths === null) return Object.keys(entities);
  const repositoryPaths = changedPaths.map((gitPath) => `/${gitPath}`);
  if (landsOnTheMainLine) return EntityOwnershipUtil.gatedEntitiesOf(entities, repositoryPaths);
  const changedEntities = EntityOwnershipUtil.pathsByOwnerOf(entities, repositoryPaths);
  const ownEntities = Object.keys(entities).filter((entityKey) => changedEntities.has(entityKey));
  return ownEntities.length === 0 ? Object.keys(entities) : ownEntities;
}

export function createMergedTreeGating(
  context: AirlocksContext, slots: AirlockSlots, agents: AirlockAgents, staleGreens: StaleGreenRegates
): MergedTreeGating {
  const { mainLine } = context;
  const {
    freeSlot, openDecision, refuseMerge, setPhase, slotWorktreeOf
  } = slots;
  const { resumeOrSpendTheAgent } = agents;
  const { returnRedGateToItsOwner } = staleGreens;

  async function runGate(job: Readonly<Job>, hasOpenIncident: boolean): Promise<boolean> {
    if (hasOpenIncident) return false;
    const worktree = slotWorktreeOf(job);
    const treeId   = MergeRun.treeOf(worktree);
    if (treeId === null) {
      await refuseMerge(job, MERGE_REFUSED_CAUSES.gitFailed, 'The merged tree cannot be read.');
      return true;
    }
    const isTheBranchTree = mergedTreeIsTheBranchTree(worktree, job, treeId);
    const admission = await context.hold((hold) => {
      const entities = hold.board.pipeline()?.entities ?? null;
      // With entities, whether the green covers the landing waits for the gate set, which git names outside the hold.
      if (entities !== null || !mergedTreeWasLastPassed(hold.board, job, treeId, isTheBranchTree)) return { landsUngated: false, entities };
      setPhase(hold, job, 'landing');
      return { landsUngated: true, entities };
    });
    if (admission.landsUngated) return true;
    // Only a pipeline with entities asks git which paths the landing changes.
    const gatedEntities = admission.entities === null
      ? undefined
      : landingGatedEntitiesOf(admission.entities, worktree, AirlockReadings.slotOf(job).targetTip, AirlockReadings.slotOf(job).target === mainLine);
    if (gatedEntities !== undefined && isTheBranchTree && await context.hold((hold) => {
      if (!mergedTreeWasLastPassed(hold.board, job, treeId, isTheBranchTree, gatedEntities)) return false;
      setPhase(hold, job, 'landing');
      return true;
    })) return true;
    const gate = context.mergedTreeGateOf(worktree, treeId, 'merge', gatedEntities, job.id);
    // The job stays in `gating` and the sweep goes on with the next target; the run's end wakes the pass that settles it.
    if (gate === 'running') return false;
    const {
      outcome, step, entity, output, stamp, cacheReports
    } = gate;
    const settled = await context.hold((hold): RedMergedTreeSettlement => {
      recordStepRuns(hold, gate);
      if (outcome !== 'setup-failed' && outcome !== 'sandbox-unavailable') hold.board.recordGateRan(gateRanFieldsOf(treeId, outcome, cacheReports), hold.at);
      const agent = AirlockReadings.mergeAgentOf(hold.board, job);
      if (outcome === 'passed') {
        // Only the branch's own tree is the row's: a merged tree with a merge commit goes back to the branch tip when the slot frees.
        if (isTheBranchTree) hold.board.recordPipelineJudgedBy(AirlockReadings.ticketIdOf(job), treeId, stamp, hold.at);
        if (agent !== undefined) hold.board.endJob(agent.id, { outcome: 'resolved', commit: MergeRun.headOf(worktree) ?? treeId }, hold.at);
        setPhase(hold, job, 'landing');
        return { verdict: 'settled' };
      }
      if (outcome === 'failed') {
        if (AirlockReadings.isRefresh(job)) return { verdict: 'park' };
        const landing = AirlockReadings.crossingLandingOf(hold.board, AirlockReadings.ticketIdOf(job));
        if (landing !== null) return { verdict: 'return-to-owner', owner: MergeRun.redGateOwnerOf(landing, entity), homeEntity: landing.homeEntity };
        const resumesSpent = resumeOrSpendTheAgent(hold, job, agent, {
          step: step ?? '', ...(entity === undefined ? {} : { entity }), output, worktree
        });
        return { verdict: resumesSpent ? 'park' : 'settled' };
      }
      hold.board.openIncident({
        kind:        MERGE_GATE_INCIDENT_KINDS[outcome],
        ticketIds:   job.ticketIds,
        jobId:       job.id,
        facts:       { tree: treeId, gate: step ?? '' },
        defaultMove: 'gate-retry',
      }, hold.at);
      return { verdict: 'settled' };
    });
    context.mergedTreeGateSettled(worktree, treeId, 'merge', gatedEntities, gate);
    if (settled.verdict === 'park') await abortAndPark(job, AirlockReadings.tailOf(output, context.limits.CHECK_OUTPUT_TAIL_LINES));
    if (settled.verdict === 'return-to-owner') {
      await returnRedMergedTreeToItsOwner(job, settled, {
        treeId, step: step ?? '', ...(entity === undefined ? {} : { entity }), output, commit: MergeRun.headOf(worktree) ?? ''
      });
    }
    return true;
  }

  /** A crossing ticket's red merged tree goes to the entity that owns the red gate (E65): the merge aborts, and its ticket is returned. */
  async function returnRedMergedTreeToItsOwner(
    job: Readonly<Job>, route: Readonly<{ owner: RedGateOwner; homeEntity: EntityKey }>, red: StaleGreenRed
  ): Promise<void> {
    const ticketId = AirlockReadings.ticketIdOf(job);
    await freeSlot(job, { outcome: 'failed', cause: RED_GATE_RETURN_CAUSES[route.owner.owner] }, (hold) => {
      hold.board.setTicketMergeQueued(ticketId, false, hold.at);
      returnRedGateToItsOwner(hold, ticketId, route, red);
    });
  }

  /** The merge aborts, the slot frees and the ticket is held `parked:merge-gate-red` with a `parked` decision; a refresh asks User. */
  async function abortAndPark(job: Readonly<Job>, notes: string): Promise<boolean> {
    const cause = MERGE_GATE_RED_PARK_CAUSE;
    if (AirlockReadings.isRefresh(job)) {
      await refuseMerge(job, cause, notes);
      return true;
    }
    const ticketId = AirlockReadings.ticketIdOf(job);
    await freeSlot(job, { outcome: 'failed', cause }, (hold) => {
      hold.board.setTicketMergeQueued(ticketId, false, hold.at);
      hold.board.holdTicket(ticketId, `${PARKED_HOLD_PREFIX}${cause}`, hold.at);
      openDecision(hold, 'parked', [ticketId], notes);
    });
    return true;
  }

  return { runGate };
}
