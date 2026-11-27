/** User's check of the gates a setup draft changes or adds, one per level it touched, which Hephaestus starts, ends or stops. */
import type { PipelineSetupChanged } from './@types/BoardChanges.ts';
import type {
  EntityKey,
  Pipeline,
  PipelineEntity,
  PipelineGate
} from './@types/Pipeline.ts';
import type { PipelineCheckEnding, PipelineCheckStart, PipelineSetup } from './@types/PipelineSetup.ts';
import type { BoardRecords }                                           from './BoardRecords.ts';
import { BoardRefusal }                                                from './BoardRefusal.ts';
import { type PipelineSetupRecord, entityPartsOf }                     from './PipelineSetupRecord.ts';
import { UNFINISHED_PIPELINE_CHECK_STATES }                            from './constants/PipelineSetupVocabulary.ts';
import { PipelineChangeUtil }                                          from './utils/PipelineChangeUtil.ts';
import { PipelineUtil }                                                from './utils/PipelineUtil.ts';

/** Where a check is held: the record itself for the forge's own, an entity's part for that entity's. */
interface CheckHolder {
  entityKey: EntityKey | null;
  holder:    Pick<PipelineSetup, 'check'>;
}

const ROOT_FOLDER = '/';

function checkHoldersOf(setup: PipelineSetup): CheckHolder[] {
  return [{ entityKey: null, holder: setup }, ...entityPartsOf(setup).map(([entityKey, part]) => ({ entityKey, holder: part }))];
}

/** The record for the forge's check; an entity's existing part for its check, `undefined` when the record holds no such part. */
function existingCheckHolderOf(setup: PipelineSetup, entityKey: EntityKey | undefined): Pick<PipelineSetup, 'check'> | undefined {
  if (entityKey === undefined) return setup;
  return setup.entities !== undefined && Object.hasOwn(setup.entities, entityKey) ? setup.entities[entityKey] : undefined;
}

function entityOf(pipeline: Readonly<Pipeline>, entityKey: EntityKey): Readonly<PipelineEntity> | undefined {
  return pipeline.entities !== undefined && Object.hasOwn(pipeline.entities, entityKey) ? pipeline.entities[entityKey] : undefined;
}

export class PipelineSetupChecks {
  constructor(
    private readonly records: BoardRecords,
    private readonly setupRecord: PipelineSetupRecord,
  ) {}

  /**
   * User's check of the gates the draft changes or adds against the base pipeline, which Hephaestus runs. On a draft over entities, each
   * entity whose gates the draft touched gets a check of its own, of those gates. Refuses `no-gate-to-check` when the draft touches no
   * gate, and `pipeline-check-running` while an earlier check waits or runs.
   */
  requestCheck(setupId: string, at: string): PipelineSetupChanged {
    const setup = this.setupRecord.requireMovableSetup(setupId);
    const unfinishedStates: readonly string[] = UNFINISHED_PIPELINE_CHECK_STATES;
    const unfinished = checkHoldersOf(setup).some(({ holder }) => holder.check !== undefined && unfinishedStates.includes(holder.check.state));
    if (unfinished) throw new BoardRefusal({ reason: 'pipeline-check-running', setupId });
    const touchedLevels = this.checkedLevelsOf(setup)
      .map((entityKey) => ({ entityKey, gateNames: this.touchedGatesOf(setup, entityKey).map((gate) => gate.name) }))
      .filter((level) => level.gateNames.length > 0);
    if (touchedLevels.length === 0) throw new BoardRefusal({ reason: 'no-gate-to-check', setupId });
    const logged = touchedLevels.map(({ entityKey, gateNames }) => {
      const holder = entityKey === undefined ? setup : this.setupRecord.entityPartOf(setup, entityKey);
      holder.check = {
        draftRevision: setup.draftRevision, gateNames, state: 'queued', result: null, reason: null
      };
      const fields = { revision: setup.draftRevision, gateNames };
      return this.records.logger.log({ kind: 'pipeline-check-requested', setupId, fields }, at);
    });
    this.setupRecord.store(setup);
    return { logged, setup };
  }

  /** The levels of the open record whose check waits for Hephaestus: `null` for the forge's own, else the entity's key. */
  queuedCheckLevels(): (EntityKey | null)[] {
    const setup = this.setupRecord.openSetupRecord();
    if (setup === null) return [];
    return checkHoldersOf(setup).filter(({ holder }) => holder.check?.state === 'queued').map(({ entityKey }) => entityKey);
  }

  /**
   * Hephaestus's start of the record's queued check, of the forge or of one entity, in the hold: the prepare steps and the touched gates
   * of the draft as it is now, which the check then names; an entity's come with its first home. `null` when the record is gone, is
   * another one, or has no queued check there.
   */
  startCheck(setupId: string, entityKey?: EntityKey): PipelineCheckStart | null {
    const setup = this.setupRecord.openSetupRecord();
    const check = setup?.setupId === setupId ? existingCheckHolderOf(setup, entityKey)?.check : undefined;
    if (setup === null || check?.state !== 'queued') return null;
    const gates = this.touchedGatesOf(setup, entityKey);
    check.draftRevision = setup.draftRevision;
    check.gateNames = gates.map((gate) => gate.name);
    check.state = 'running';
    this.setupRecord.store(setup);
    if (entityKey === undefined) {
      return { draftRevision: setup.draftRevision, prepare: structuredClone(setup.draft?.prepare ?? []), gates: structuredClone(gates) };
    }
    const entity = setup.draft === null ? undefined : entityOf(setup.draft, entityKey);
    return {
      draftRevision: setup.draftRevision,
      prepare:       structuredClone(entity?.prepare ?? []),
      gates:         structuredClone(gates),
      entityHome:    entity?.home[0] ?? ROOT_FOLDER,
    };
  }

  /** The end of the record's running check there. `null` when the record is gone, is another one, or that check is no longer running. */
  endCheck(setupId: string, ending: PipelineCheckEnding, entityKey?: EntityKey): PipelineSetupChanged | null {
    const setup = this.setupRecord.openSetupRecord();
    const check = setup?.setupId === setupId ? existingCheckHolderOf(setup, entityKey)?.check : undefined;
    if (setup === null || check?.state !== 'running') return null;
    check.state  = ending.state;
    check.result = ending.state === 'checked' ? structuredClone(ending.result) : null;
    check.reason = ending.state === 'cannot-run' ? ending.reason : null;
    this.setupRecord.store(setup);
    return { logged: [], setup };
  }

  /** At a Hephaestus's start, or as it stops: each running check reads `stopped`, with no result, and runs again only on User's press. */
  stopRunningCheck(): PipelineSetupChanged | null {
    const setup = this.setupRecord.openSetupRecord();
    if (setup === null) return null;
    const running = checkHoldersOf(setup).flatMap(({ holder }) => (holder.check?.state === 'running' ? [holder.check] : []));
    if (running.length === 0) return null;
    for (const check of running) check.state = 'stopped';
    this.setupRecord.store(setup);
    return { logged: [], setup };
  }

  /**
   * The gates the draft changes or adds against the base pipeline, in draft order; a removed gate has nothing to run. With an entity key,
   * the entity's gates against the base's same entity, a new entity's against none.
   */
  private touchedGatesOf(setup: Readonly<PipelineSetup>, entityKey?: EntityKey): PipelineGate[] {
    if (setup.draft === null) return [];
    const base  = this.setupRecord.basePipeline();
    const draft = entityKey === undefined ? setup.draft : PipelineUtil.pipelineOfEntity(setup.draft, entityKey);
    if (draft === null) return [];
    const baseOfLevel = entityKey === undefined ? base : PipelineUtil.pipelineOfEntity(base, entityKey) ?? PipelineUtil.minimalPipelineOf();
    const touchedFields: readonly string[] = PipelineChangeUtil.changesBetween(baseOfLevel, draft, false)
      .filter((change) => change.change !== 'removed')
      .map((change) => change.field);
    return draft.gates.filter((gate) => touchedFields.includes(`gate:${gate.name}`));
  }

  /** The levels a check covers: the forge's own on a draft without entities, else every entity of the draft. */
  private checkedLevelsOf(setup: Readonly<PipelineSetup>): (EntityKey | undefined)[] {
    const entities = setup.draft?.entities;
    return entities === undefined ? [undefined] : Object.keys(entities);
  }
}
