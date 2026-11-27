/**
 * The open setup record as every part of the setup reaches it: required open or movable, stored, an entity's part, the base pipeline,
 * and the step a User edit or a reopen moves. While an Apply request waits for its commit, the record is not movable: every part's move
 * refuses but Apply's own.
 */
import type { LogRecord }                                             from './@types/LogRecord.ts';
import type { EntityKey, Pipeline }                                   from './@types/Pipeline.ts';
import type { PipelineSetup, PipelineSetupEntity, PipelineSetupStep } from './@types/PipelineSetup.ts';
import type { BoardRecords }                                          from './BoardRecords.ts';
import { BoardRefusal }                                               from './BoardRefusal.ts';
import { PENDING_APPLY_REQUEST_STATES, PIPELINE_SETUP_STEPS }         from './constants/PipelineSetupVocabulary.ts';
import { PipelineSetupUtil }                                          from './utils/PipelineSetupUtil.ts';
import { PipelineUtil }                                               from './utils/PipelineUtil.ts';

export class PipelineSetupRecord {
  constructor(private readonly records: BoardRecords) {}

  openSetupRecord(): PipelineSetup | null {
    const reading = this.records.pipelineSetupReading;
    return reading.verdict === 'readable' ? reading.setup : null;
  }

  /** The newest of the record's touched and resumed records is a touch: its snapshot is not clean. */
  setupSnapshotIsTouched(setupId: string): boolean {
    const newest = [...this.records.storedLogRecords, ...this.records.loggedRecords].findLast((record) => 'setupId' in record
      && record.setupId === setupId
      && (record.kind === 'pipeline-snapshot-touched' || record.kind === 'pipeline-setup-resumed'));
    return newest?.kind === 'pipeline-snapshot-touched';
  }

  /** The stored pipeline, or the minimal one for a first setup: what the change list and Undo compare with. */
  basePipeline(): Pipeline {
    return structuredClone(this.records.pipeline ?? PipelineUtil.minimalPipelineOf()) as Pipeline;
  }

  requireOpenSetup(setupId: string): PipelineSetup {
    const reading = this.records.pipelineSetupReading;
    if (reading.verdict === 'malformed') throw new BoardRefusal({ reason: 'pipeline-setup-unreadable', problem: reading.problem });
    if (reading.verdict === 'absent' || reading.setup.setupId !== setupId) throw new BoardRefusal({ reason: 'no-setup-open', setupId });
    return reading.setup;
  }

  requireMovableSetup(setupId: string): PipelineSetup {
    const setup = this.requireOpenSetup(setupId);
    const { applyRequest } = setup;
    const states: readonly string[] = PENDING_APPLY_REQUEST_STATES;
    if (applyRequest !== null && states.includes(applyRequest.state)) throw new BoardRefusal({ reason: 'pipeline-apply-pending', setupId });
    return setup;
  }

  store(setup: PipelineSetup): void {
    this.records.pipelineSetupReading = { verdict: 'readable', setup };
    this.records.pipelineSetupChanged = true;
  }

  /** The entity's part of the record, created empty the first time a move records into it. */
  entityPartOf(setup: PipelineSetup, entityKey: EntityKey): PipelineSetupEntity {
    const entities = setup.entities ?? {};
    setup.entities = entities;
    const existing = Object.hasOwn(entities, entityKey) ? entities[entityKey] : undefined;
    if (existing !== undefined) return existing;
    const created: PipelineSetupEntity = {
      agentJobId: null, findings: [], questions: [], constitution: null
    };
    entities[entityKey] = created;
    return created;
  }

  /** Only User's edit of a step before the current one of a first setup reopens it; the agent's moves never move a step. */
  userEditReopenRecords(setup: PipelineSetup, step: PipelineSetupStep, at: string): LogRecord[] {
    if (setup.mode !== 'setup' || PipelineSetupUtil.stepIndexOf(step) >= PipelineSetupUtil.stepIndexOf(setup.currentStep)) return [];
    return this.reopenedStepRecords(setup, step, at);
  }

  /** Only a step at or before the current one reopens, so a later step that needs a recheck still waits for its Continue. */
  reopenedStepRecords(setup: PipelineSetup, step: PipelineSetupStep, at: string): LogRecord[] {
    const state = PipelineSetupUtil.stepStateOf(setup, step);
    if (state === 'not-started' || PipelineSetupUtil.stepIndexOf(step) > PipelineSetupUtil.stepIndexOf(setup.currentStep)) {
      throw new BoardRefusal({ reason: 'setup-step-not-reached', setupId: setup.setupId, step });
    }
    if (state !== 'needs-recheck') setup.stepStates[step] = 'in-progress';
    setup.currentStep = step;
    const needsRecheck = PIPELINE_SETUP_STEPS.slice(PipelineSetupUtil.stepIndexOf(step) + 1).filter((laterStep) => setup.stepStates[laterStep] === 'done');
    for (const laterStep of needsRecheck) setup.stepStates[laterStep] = 'needs-recheck';
    this.store(setup);
    return [this.stepMovedRecord(setup, step, needsRecheck, at)];
  }

  stepMovedRecord(setup: PipelineSetup, step: PipelineSetupStep, needsRecheck: readonly PipelineSetupStep[], at: string): LogRecord {
    const fields = {
      step, state: PipelineSetupUtil.stepStateOf(setup, step), currentStep: setup.currentStep, needsRecheck: [...needsRecheck]
    };
    return this.records.logger.log({ kind: 'pipeline-setup-step-moved', setupId: setup.setupId, fields }, at);
  }

  /** The readable record when it is `setupId`'s, refused `no-setup-open` for another record or none. */
  openSetupOf(setupId: string): Readonly<PipelineSetup> {
    const setup = this.openSetupRecord();
    if (setup?.setupId !== setupId) throw new BoardRefusal({ reason: 'no-setup-open', setupId });
    return setup;
  }

  /** What the hold writes for the record: the record, `removed` after a start over, or `unchanged`. */
  pipelineSetupWrite(): { write: 'record'; setup: PipelineSetup } | { write: 'removed' } | { write: 'unchanged' } {
    if (!this.records.pipelineSetupChanged) return { write: 'unchanged' };
    const reading = this.records.pipelineSetupReading;
    return reading.verdict === 'readable' ? { write: 'record', setup: reading.setup } : { write: 'removed' };
  }
}
