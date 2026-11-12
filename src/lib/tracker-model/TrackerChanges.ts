/** The Board's changes to the tracker as a whole rather than to one row or ticket: its settings, a note in its log, and its clearing. */
import type {
  ConcurrencyLimitSet,
  Logged,
  PipelineChanged,
  OverseerStateSet,
  TrackerCleared
} from './@types/BoardChanges.ts';
import { GATE_PHASES, type GatePhase } from './@types/GatePhase.ts';
import type { LogRecordFieldsOf }      from './@types/LogRecord.ts';
import {
  PIPELINE_FORMAT_VERSION,
  type Pipeline,
  type PipelineApproval,
  type PipelineGate,
  type PipelineStep
} from './@types/Pipeline.ts';
import type { OverseerState, ViewRange } from './@types/TrackerProgress.ts';
import type { BoardRecords }             from './BoardRecords.ts';
import { BoardRefusal }                  from './BoardRefusal.ts';
import type { DispatchQueries }          from './DispatchQueries.ts';
import { PipelineUtil }                  from './utils/PipelineUtil.ts';
import { TicketChartUtil }               from './utils/TicketChartUtil.ts';

/** No review, no re-review and no gates: valid, and it counts as set. */
function minimalPipelineOf(): Pipeline {
  return {
    version: PIPELINE_FORMAT_VERSION, prepare: [], gates: [], phases: { build: [], review: [], merge: [] }
  };
}

export class TrackerChanges {
  constructor(
    private readonly records: BoardRecords,
    private readonly dispatchQueries: DispatchQueries,
  ) {}

  setChartRange(view: ViewRange, at: string): Logged {
    this.records.progress.view = view;
    return { logged: [this.records.logger.log({ kind: 'chart-range-set', fields: { view } }, at)] };
  }

  setConcurrencyLimit(limit: number, at: string): ConcurrencyLimitSet {
    const previousLimit                    = this.dispatchQueries.concurrency().limit;
    this.records.progress.concurrencyLimit = limit;
    const logged                           = [this.records.logger.log({ kind: 'concurrency-limit-set', fields: { limit } }, at)];
    return { logged, previousLimit, concurrency: this.dispatchQueries.concurrency() };
  }

  setOverseerState(state: OverseerState, at: string): OverseerStateSet {
    const { progress }   = this.records;
    const previousState  = this.dispatchQueries.overseerState();
    progress.overseerState = state;
    return { logged: [this.records.logger.log({ kind: 'overseer-set', fields: { state } }, at)], previousState };
  }

  /**
   * Every pipeline change is accepted with tickets in flight: no row is stamped here, and each row records the hash of the pipeline it is
   * judged by at its next gate run.
   */
  private changedPipelineOf(change: (pipeline: Pipeline) => void, logged: Logged['logged']): PipelineChanged {
    const pipeline = this.records.pipeline ?? minimalPipelineOf();
    change(pipeline);
    this.records.pipeline        = pipeline;
    this.records.pipelineChanged = true;
    return { logged, pipeline };
  }

  /** A step of the same name is replaced where it stands, so a prepare step is set rather than added twice. */
  setPrepareStep(step: PipelineStep, at: string): PipelineChanged {
    const logged = [this.records.logger.log({ kind: 'pipeline-prepare-step-set', fields: { name: step.name, run: step.run } }, at)];
    return this.changedPipelineOf((pipeline) => {
      const index = pipeline.prepare.findIndex((candidate) => candidate.name === step.name);
      if (index === -1) pipeline.prepare.push({ ...step });
      else pipeline.prepare[index] = { ...step };
    }, logged);
  }

  /**
   * A gate of the same name is replaced where it stands. With no `phases`, a new gate runs last in every phase and a replaced one keeps its
   * phases; with them, the gate runs in exactly those phases, keeping its place in a phase it was in and running last in one it joins.
   */
  addGate(gate: PipelineGate, at: string, phases: readonly GatePhase[] | null = null): PipelineChanged {
    if (phases !== null) this.refuseUnusablePhases(gate.name, phases);
    const logged = [this.records.logger.log({ kind: 'pipeline-gate-added', fields: { name: gate.name, run: gate.run } }, at)];
    return this.changedPipelineOf((pipeline) => {
      const index    = pipeline.gates.findIndex((candidate) => candidate.name === gate.name);
      const replaced = index !== -1;
      if (replaced) pipeline.gates[index] = { ...gate };
      else pipeline.gates.push({ ...gate });
      if (phases === null && replaced) return;
      for (const phase of GATE_PHASES) {
        const runsInPhase = phases === null || phases.includes(phase);
        const isInPhase   = pipeline.phases[phase].includes(gate.name);
        if (runsInPhase && !isInPhase) pipeline.phases[phase].push(gate.name);
        if (!runsInPhase && isInPhase) pipeline.phases[phase] = pipeline.phases[phase].filter((gateName) => gateName !== gate.name);
      }
    }, logged);
  }

  /** A gate in no phase would never run and leave the file unreadable, and a phase the pipeline does not know has no place to run it. */
  private refuseUnusablePhases(gateName: string, phases: readonly GatePhase[]): void {
    if (phases.length === 0) throw new BoardRefusal({ reason: 'gate-without-phase', gateName });
    const unknownPhase = phases.find((phase) => !GATE_PHASES.includes(phase));
    if (unknownPhase !== undefined) throw new BoardRefusal({ reason: 'unknown-gate-phase', phase: unknownPhase, phases: GATE_PHASES });
  }

  /** Only a new order of the gates the phase already runs: a gate joins or leaves a phase through `addGate`, so no gate is left in none. */
  orderPhaseGates(phase: GatePhase, names: readonly string[], at: string): PipelineChanged {
    if (!GATE_PHASES.includes(phase)) throw new BoardRefusal({ reason: 'unknown-gate-phase', phase, phases: GATE_PHASES });
    const gateNames   = this.records.pipeline?.gates.map((gate) => gate.name) ?? [];
    const unknownName = names.find((name) => !gateNames.includes(name));
    if (unknownName !== undefined) throw new BoardRefusal({ reason: 'unknown-gate', gateName: unknownName, gateNames });
    const phaseGateNames = this.records.pipeline?.phases[phase] ?? [];
    const namesEachOnce  = names.length > 0 && new Set(names).size === names.length;
    const isReorder      = namesEachOnce && names.length === phaseGateNames.length && names.every((name) => phaseGateNames.includes(name));
    if (!isReorder) throw new BoardRefusal({
      reason: 'phase-order-not-a-reorder', phase, names, phaseGateNames
    });
    const logged = [this.records.logger.log({ kind: 'pipeline-gates-ordered', fields: { phase, names: [...names] } }, at)];
    return this.changedPipelineOf((pipeline) => {
      pipeline.phases[phase] = [...names];
    }, logged);
  }

  /** No gates on purpose: an empty list stored, which counts as set, unlike no pipeline at all. */
  setNoGates(at: string): PipelineChanged {
    const logged = [this.records.logger.log({ kind: 'pipeline-gates-none', fields: {} }, at)];
    return this.changedPipelineOf((pipeline) => {
      pipeline.gates.length = 0;
      for (const phase of GATE_PHASES) pipeline.phases[phase].length = 0;
    }, logged);
  }

  removeGate(name: string, at: string): PipelineChanged {
    const gateNames = this.records.pipeline?.gates.map((gate) => gate.name) ?? [];
    if (!gateNames.includes(name)) throw new BoardRefusal({ reason: 'unknown-gate', gateName: name, gateNames });
    const logged = [this.records.logger.log({ kind: 'pipeline-gate-removed', fields: { name } }, at)];
    return this.changedPipelineOf((pipeline) => {
      pipeline.gates.splice(pipeline.gates.findIndex((gate) => gate.name === name), 1);
      for (const phase of GATE_PHASES) pipeline.phases[phase] = pipeline.phases[phase].filter((gateName) => gateName !== name);
    }, logged);
  }

  /** Refused with no stored pipeline: a file holding only the switch would read as no gates on purpose and lift `checks-not-set`. */
  setApproval(approval: PipelineApproval, on: boolean, at: string): PipelineChanged {
    if (this.records.pipeline === null) throw new BoardRefusal({ reason: 'approval-without-pipeline', approval });
    const logged = [this.records.logger.log({ kind: 'pipeline-approval-set', fields: { approval, state: on ? 'on' : 'off' } }, at)];
    return this.changedPipelineOf((pipeline) => {
      pipeline.approvals = { ...pipeline.approvals, [approval]: on };
    }, logged);
  }

  /**
   * At a gate run in `phase`: the ticket's row records that phase and the stored pipeline's hash of it, or loses both when none is stored.
   * A green run records its tree as `greenTree` beside them, filing the ticket's row when it has none; any other run removes it, so the row
   * never names a tree the recorded gates did not pass.
   */
  recordPipelineJudgedBy(ticketId: string, greenTree: string | null, phase: GatePhase, at: string): void {
    const ticket       = this.records.requireTicket(ticketId);
    const { pipeline } = this.records;
    const row          = greenTree === null || pipeline === null ? this.records.linkedTaskRecordOf(ticket) : this.records.ensureTaskForTicket(ticket, at);
    if (row === undefined) return;
    if (pipeline === null) {
      delete row.pipelineHash;
      delete row.greenPhase;
      delete row.greenTree;
      return;
    }
    row.pipelineHash = PipelineUtil.phaseHashOf(pipeline, phase);
    row.greenPhase   = phase;
    if (greenTree === null) delete row.greenTree;
    else row.greenTree = greenTree;
  }

  recordWorktreeRepaired(ticketId: string, fields: LogRecordFieldsOf<'worktree-repaired'>, at: string): Logged {
    this.records.requireTicket(ticketId);
    return { logged: [this.records.logger.log({ kind: 'worktree-repaired', ticketId, fields: { step: fields.step, patchPath: fields.patchPath } }, at)] };
  }

  /** The gate ran outside the hold, so only its outcome is recorded here. */
  recordGateRan(fields: LogRecordFieldsOf<'gate-ran'>, at: string): Logged {
    return { logged: [this.records.logger.log({ kind: 'gate-ran', fields: { tree: fields.tree, outcome: fields.outcome, cached: fields.cached } }, at)] };
  }

  recordNote(text: string, at: string): Logged {
    return { logged: [this.records.logger.log({ kind: 'note', fields: { text } }, at)] };
  }

  /**
   * Empties the rows in place rather than replacing the progress, so the tracker id readers key their choices by and the id counter survive.
   * A surviving ticket is re-seeded from its own stamps, except a low ticket with no row; the epics go only with the tickets.
   * What becomes of the log is the sink's to decide.
   */
  clearTracker(request: { ticketsSurvive: boolean }, at: string): TrackerCleared {
    const { progress, ticketRecords } = this.records;
    const removedTaskCount            = progress.tasks.length;
    progress.startedAt                = at;
    progress.view                     = { kind: 'auto' };
    progress.tasks.length             = 0;
    const logged                      = [this.records.logger.log({ kind: 'tracker-cleared', fields: {} }, at)];

    if (!request.ticketsSurvive) {
      ticketRecords.length = 0;
      return {
        logged, removedTaskCount, survivingTicketCount: 0, removedEpicCount: this.removeEveryEpic()
      };
    }
    for (const ticket of ticketRecords) {
      // A reopen clears `started`, so the row the ticket held before the clear is what says it was worked.
      const ticketHadNoRowToLose = ticket.frontmatter.task === null && TicketChartUtil.ticketStaysOffTheChart(ticket.frontmatter);
      if (!ticketHadNoRowToLose) this.records.seedTaskFromTicket(ticket);
      this.records.markChanged(ticket);
    }
    return {
      logged, removedTaskCount, survivingTicketCount: ticketRecords.length, removedEpicCount: 0
    };
  }

  private removeEveryEpic(): number {
    const { epicRecords, changedEpicRecords, removedEpicRecords } = this.records;
    const removedEpicCount = epicRecords.length;
    removedEpicRecords.push(...epicRecords);
    epicRecords.length        = 0;
    changedEpicRecords.length = 0;
    return removedEpicCount;
  }
}
