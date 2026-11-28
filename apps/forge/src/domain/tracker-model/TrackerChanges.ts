/** The Board's changes to the tracker as a whole rather than to one row or ticket: its settings, a note in its log, and its clearing. */
import type {
  ConcurrencyLimitSet,
  Logged,
  PipelineChanged,
  HephaestusStateSet,
  TrackerCleared
} from './@types/BoardChanges.ts';
import { GATE_PHASES, type GatePhase, type GateRunStamp } from './@types/GatePhase.ts';
import type { PipelineStepRun }                           from './@types/Job.ts';
import type { LogRecordFieldsOf }                         from './@types/LogRecord.ts';
import {
  type Pipeline,
  type PipelineAgent,
  type PipelineApproval,
  type PipelineBilling,
  type PipelineGate,
  type PipelineStep,
  type PipelineTool
} from './@types/Pipeline.ts';
import type { HephaestusState, ViewRange } from './@types/TrackerProgress.ts';
import type { BoardRecords }               from './BoardRecords.ts';
import { BoardRefusal }                    from './BoardRefusal.ts';
import type { DispatchQueries }            from './DispatchQueries.ts';
import { PENDING_APPLY_REQUEST_STATES }    from './constants/PipelineSetupVocabulary.ts';
import { PipelineUtil }                    from './utils/PipelineUtil.ts';
import { TicketChartUtil }                 from './utils/TicketChartUtil.ts';

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

  /** Whether the board may take it now is its command's to judge: only git knows the branches the old names left. */
  setBranchNamespace(branchNamespace: string, at: string): Logged {
    this.records.progress.branchNamespace = branchNamespace;
    return { logged: [this.records.logger.log({ kind: 'branch-namespace-set', fields: { namespace: branchNamespace } }, at)] };
  }

  setHephaestusState(state: HephaestusState, at: string): HephaestusStateSet {
    const { progress }   = this.records;
    const previousState  = this.dispatchQueries.hephaestusState();
    progress.hephaestusState = state;
    return { logged: [this.records.logger.log({ kind: 'hephaestus-set', fields: { state } }, at)], previousState };
  }

  /** A ticket of each dependent that the crossing ticket's package change breaks was filed in the crossing ticket's group. */
  recordDependentFixFiled(ticketId: string, fix: LogRecordFieldsOf<'dependent-fix-filed'>, at: string): Logged {
    this.records.requireTicket(ticketId);
    return { logged: [this.records.logger.log({ kind: 'dependent-fix-filed', ticketId, fields: { entity: fix.entity, fixTicketIds: [...fix.fixTicketIds] } }, at)] };
  }

  /**
   * While an Apply waits for its constitution commit, a `gate` verb would change the pipeline the request was checked against, so it
   * refuses, and the request's `pipeline-moved` check stays true until its stage 2.
   */
  private refusePendingApply(): void {
    const reading = this.records.pipelineSetupReading;
    if (reading.verdict !== 'readable' || reading.setup.applyRequest === null) return;
    const pendingStates: readonly string[] = PENDING_APPLY_REQUEST_STATES;
    if (pendingStates.includes(reading.setup.applyRequest.state)) throw new BoardRefusal({ reason: 'pipeline-apply-pending', setupId: reading.setup.setupId });
  }

  /** Beside `entities` the forge's own prepare steps, gates and reach stay empty, and each entity's are set in the pipeline builder. */
  private refuseEntityPipeline(): void {
    const entities = this.records.pipeline?.entities;
    if (entities !== undefined) throw new BoardRefusal({ reason: 'pipeline-set-per-entity', entityKeys: Object.keys(entities) });
  }

  /**
   * Every pipeline change is accepted with tickets in flight: no row is stamped here, and each row records the hash of the pipeline it is
   * judged by at its next gate run.
   */
  private changedPipelineOf(change: (pipeline: Pipeline) => void, logged: Logged['logged']): PipelineChanged {
    this.refusePendingApply();
    const pipeline = this.records.pipeline ?? PipelineUtil.minimalPipelineOf();
    change(pipeline);
    this.records.pipeline        = pipeline;
    this.records.pipelineChanged = true;
    return { logged, pipeline };
  }

  /** A step of the same name is replaced where it stands, so a prepare step is set rather than added twice. */
  setPrepareStep(step: PipelineStep, at: string): PipelineChanged {
    this.refuseEntityPipeline();
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
    this.refuseEntityPipeline();
    this.refusePendingApply();
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
    this.refuseEntityPipeline();
    this.refusePendingApply();
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

  /** Apply's write of the whole pipeline, which replaces the stored one; Apply logs the change itself. */
  applyPipeline(pipeline: Pipeline): void {
    this.records.pipeline        = structuredClone(pipeline);
    this.records.pipelineChanged = true;
  }

  /** No gates on purpose: an empty list stored, which counts as set, unlike no pipeline at all. */
  setNoGates(at: string): PipelineChanged {
    this.refuseEntityPipeline();
    const logged = [this.records.logger.log({ kind: 'pipeline-gates-none', fields: {} }, at)];
    return this.changedPipelineOf((pipeline) => {
      pipeline.gates.length = 0;
      for (const phase of GATE_PHASES) pipeline.phases[phase].length = 0;
    }, logged);
  }

  removeGate(name: string, at: string): PipelineChanged {
    this.refuseEntityPipeline();
    this.refusePendingApply();
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
    this.refusePendingApply();
    if (this.records.pipeline === null) throw new BoardRefusal({ reason: 'approval-without-pipeline', approval });
    const logged = [this.records.logger.log({ kind: 'pipeline-approval-set', fields: { approval, state: on ? 'on' : 'off' } }, at)];
    return this.changedPipelineOf((pipeline) => {
      pipeline.approvals = { ...pipeline.approvals, [approval]: on };
    }, logged);
  }

  /** Refused with no stored pipeline, as an approval is; a pipeline with entities takes it, since the switch is the board's own. */
  setAssistant(on: boolean, at: string): PipelineChanged {
    this.refusePendingApply();
    if (this.records.pipeline === null) throw new BoardRefusal({ reason: 'assistant-without-pipeline' });
    const logged = [this.records.logger.log({ kind: 'pipeline-assistant-set', fields: { state: on ? 'on' : 'off' } }, at)];
    return this.changedPipelineOf((pipeline) => {
      if (on) pipeline.assistant = true;
      else delete pipeline.assistant;
    }, logged);
  }

  /** Refused with no stored pipeline, as an approval is; `null` removes the key, so the tools follow the pipeline again. */
  setTools(tools: readonly PipelineTool[] | null, at: string): PipelineChanged {
    this.refusePendingApply();
    if (this.records.pipeline === null) throw new BoardRefusal({ reason: 'tools-without-pipeline' });
    const kept = tools === null ? [] : tools.map((tool) => ({ name: tool.name, path: tool.path }));
    const logged = [this.records.logger.log({ kind: 'pipeline-tools-set', fields: { paths: kept.map((tool) => tool.path) } }, at)];
    return this.changedPipelineOf((pipeline) => {
      if (tools === null) delete pipeline.tools;
      else pipeline.tools = kept;
    }, logged);
  }

  /** The stored pipeline's agent, with the billing sent with it, which the caller judged against the agent's vendor. */
  setAgent(agent: Readonly<PipelineAgent>, billing: Readonly<PipelineBilling> | undefined, at: string): PipelineChanged {
    this.refusePendingApply();
    if (this.records.pipeline === null) throw new BoardRefusal({ reason: 'agent-without-pipeline' });
    const program = 'pinned' in agent.program ? agent.program.pinned : 'machine';
    const logged = [this.records.logger.log({ kind: 'pipeline-agent-set', fields: { vendor: agent.vendor, program } }, at)];
    return this.changedPipelineOf((pipeline) => {
      pipeline.agent = { vendor: agent.vendor, program: 'pinned' in agent.program ? { pinned: agent.program.pinned } : { follows: 'machine' } };
      if (billing !== undefined) pipeline.billing = { ...billing };
    }, logged);
  }

  /** Refused with no stored pipeline, as an approval is: a file holding only the reach would read as no gates on purpose. */
  setReach(paths: readonly string[], at: string): PipelineChanged {
    this.refuseEntityPipeline();
    this.refusePendingApply();
    if (this.records.pipeline === null) throw new BoardRefusal({ reason: 'reach-without-pipeline' });
    const logged = [this.records.logger.log({ kind: 'pipeline-reach-set', fields: { paths: [...paths] } }, at)];
    return this.changedPipelineOf((pipeline) => {
      if (paths.length === 0) delete pipeline.reach;
      else pipeline.reach = [...paths];
    }, logged);
  }

  /**
   * At a gate run's settlement, the row records the phase and phase hashes the run read at its start, never the pipeline's now, so a
   * mid-run edit leaves a green that is not current; with no pipeline read it loses them. Only a green run records `greenTree`, so the row
   * never names a tree the recorded gates did not pass.
   */
  recordPipelineJudgedBy(ticketId: string, greenTree: string | null, stamp: GateRunStamp | null, at: string): void {
    const ticket       = this.records.requireTicket(ticketId);
    const judged       = this.records.pipeline === null ? null : stamp;
    const row          = greenTree === null || judged === null ? this.records.linkedTaskRecordOf(ticket) : this.records.ensureTaskForTicket(ticket, at);
    if (row === undefined) return;
    if (judged === null) {
      delete row.pipelineHash;
      delete row.pipelineHashes;
      delete row.greenPhase;
      delete row.greenTree;
      return;
    }
    row.pipelineHash = judged.phaseHash;
    if (judged.entityPhaseHashes === undefined) delete row.pipelineHashes;
    else row.pipelineHashes = { ...judged.entityPhaseHashes };
    row.greenPhase   = judged.phase;
    if (greenTree === null) delete row.greenTree;
    else row.greenTree = greenTree;
  }

  recordWorktreeRepaired(ticketId: string, fields: LogRecordFieldsOf<'worktree-repaired'>, at: string): Logged {
    this.records.requireTicket(ticketId);
    return { logged: [this.records.logger.log({ kind: 'worktree-repaired', ticketId, fields: { step: fields.step, patchPath: fields.patchPath } }, at)] };
  }

  /**
   * The gate ran outside the hold, so only its outcome is recorded here. Its cache reports are kept once a gate of the run reported, or once
   * the log holds a run whose gates did, so a later run that reported nothing clears the mark; a tracker whose gates never report logs as before.
   */
  recordGateRan(fields: LogRecordFieldsOf<'gate-ran'>, at: string): Logged {
    const {
      tree, outcome, cached, cacheReports
    } = fields;
    const keepsCacheReports = cacheReports !== undefined && (cacheReports.gates.some((gate) => gate.cacheReport !== null) || this.logHoldsGateCacheReports());
    return {
      logged: [this.records.logger.log({
        kind:   'gate-ran',
        fields: {
          tree, outcome, cached, ...(keepsCacheReports ? { cacheReports } : {})
        }
      }, at)]
    };
  }

  /** Step lines that ran outside the hold, one record each in run order; `phase` is `null` for a job's install. Recorded and shown only. */
  recordPipelineStepsRan(stepRuns: readonly PipelineStepRun[], phase: GatePhase | null, at: string): Logged {
    return {
      logged: stepRuns.map(({
        stepKind, stepName, entity, runMilliseconds, ending
      }) => this.records.logger.log({
        kind:   'pipeline-step-ran',
        fields: {
          stepKind, stepName, ...(phase === null ? {} : { phase }), ...(entity === undefined ? {} : { entity }), runMilliseconds, ending
        }
      }, at))
    };
  }

  private logHoldsGateCacheReports(): boolean {
    return [...this.records.storedLogRecords, ...this.records.loggedRecords].some((record) => record.kind === 'gate-ran' && record.fields.cacheReports !== undefined);
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
