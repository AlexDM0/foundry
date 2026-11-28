/**
 * `gate-run.json` and its kin, the steps a job's gate run fixed as it started, read into the run's manifest: read, validate, map. A manifest
 * is read for one phase, the one its file name stands for, so a manifest of another phase is unreadable.
 */
import type { GatePhase, GateRunStamp }               from '../../domain/tracker-model/@types/GatePhase.ts';
import type { EntityKey, PipelineGate, PipelineStep } from '../../domain/tracker-model/@types/Pipeline.ts';
import { JsonRecordUtil }                             from '../../lib/json-record/JsonRecordUtil.ts';
import type { JobFileFieldProblem }                   from '../@types/JobFileFieldProblem.ts';
import { type ExpectationCheck, JobFileShapeUtil }    from '../utils/JobFileShapeUtil.ts';
import { StoredJsonDocumentUtil }                     from '../utils/StoredJsonDocumentUtil.ts';
import type { GateRunManifestProblem }                from './@types/GateRunManifestProblem.ts';

export const GATE_RUN_MANIFEST_FORMAT_VERSION = 1;

/** A package build's manifest names the dependent whose step a step is; the job's own steps name none. */
export interface ManifestStepEntity {
  entity?: EntityKey;
}

/**
 * A gate run's phase, its phase hash and the steps it runs, fixed as the run starts: a pipeline edited or reordered mid-run changes neither
 * the gate a step folder runs nor the hash the settlement stamps.
 */
export interface GateRunManifest extends GateRunStamp {
  prepare: (PipelineStep & ManifestStepEntity)[];
  gates:   (PipelineGate & ManifestStepEntity)[];
}

export type GateRunManifestReading =
  | { verdict: 'readable'; manifest: GateRunManifest }
  | { verdict: 'absent' }
  | { verdict: 'unreadable'; problem: GateRunManifestProblem };

const OPTIONAL_TEXT: ExpectationCheck = [JobFileShapeUtil.optional(JobFileShapeUtil.valueIsText), 'text'];
const OPTIONAL_TEXT_LIST: ExpectationCheck = [JobFileShapeUtil.optional(JobFileShapeUtil.valueIsATextList), 'a-list-of-text'];

const PREPARE_STEP_CHECKS: Readonly<Record<string, ExpectationCheck>> = {
  name:   [JobFileShapeUtil.valueIsText, 'text'],
  run:    [JobFileShapeUtil.valueIsText, 'text'],
  in:     OPTIONAL_TEXT,
  entity: OPTIONAL_TEXT,
};

const GATE_CHECKS: Readonly<Record<string, ExpectationCheck>> = {
  ...PREPARE_STEP_CHECKS,
  fix:       OPTIONAL_TEXT,
  definedBy: OPTIONAL_TEXT_LIST,
  network:   OPTIONAL_TEXT_LIST,
  writes:    OPTIONAL_TEXT_LIST,
  forgeOnly: [JobFileShapeUtil.optional((value) => value === true), 'true'],
};

/** The first entry of the list `field` that is no object or fails `checks`; `null` when every entry holds. */
function listProblemOf(
  document: Readonly<Record<string, unknown>>, field: string, checks: Readonly<Record<string, ExpectationCheck>>
): JobFileFieldProblem | null {
  const entries = document[field];
  if (!Array.isArray(entries)) return { code: 'field-is-not', field, expected: 'a-list' };
  for (const [index, entry] of (entries as unknown[]).entries()) {
    if (!JsonRecordUtil.valueIsAPlainObject(entry)) return { code: 'field-is-not', field: `${field}[${index}]`, expected: 'an-object' };
    const problem = JobFileShapeUtil.firstMistypedFieldOf(entry, checks, `${field}[${index}].`);
    if (problem !== null) return problem;
  }
  return null;
}

/** Only the fields a step or gate may hold, each copied only when stored, so the manifest is the one a run wrote. */
function storedFieldsOf<Entry>(entry: Readonly<Record<string, unknown>>, checks: Readonly<Record<string, ExpectationCheck>>): Entry {
  const copied = Object.keys(checks).flatMap((field) => {
    const value = entry[field];
    if (value === undefined) return [];
    return [[field, Array.isArray(value) ? [...value as unknown[]] : value] as const];
  });
  return Object.fromEntries(copied) as Entry;
}

function manifestOf(document: Readonly<Record<string, unknown>>): GateRunManifest {
  const entityPhaseHashes = document['entityPhaseHashes'] as Record<string, string> | undefined;
  return {
    phase:     document['phase'] as GatePhase,
    phaseHash: document['phaseHash'] as string,
    ...(entityPhaseHashes === undefined ? {} : { entityPhaseHashes: { ...entityPhaseHashes } }),
    prepare:   (document['prepare'] as Record<string, unknown>[]).map((step) => storedFieldsOf<PipelineStep & ManifestStepEntity>(step, PREPARE_STEP_CHECKS)),
    gates:     (document['gates'] as Record<string, unknown>[]).map((gate) => storedFieldsOf<PipelineGate & ManifestStepEntity>(gate, GATE_CHECKS)),
  };
}

export class GateRunManifestIngestion {
  constructor(private readonly manifestFilePath: string, private readonly phase: GatePhase) {}

  /** Never throws: a manifest that cannot be read whole is `unreadable`, and none of its steps is handed out. */
  read(): GateRunManifestReading {
    const stored = StoredJsonDocumentUtil.documentAt(this.manifestFilePath, GATE_RUN_MANIFEST_FORMAT_VERSION);
    if (stored.verdict !== 'readable') return stored;
    const { document } = stored;
    const phaseProblem: GateRunManifestProblem | null = document['phase'] === this.phase ? null : { code: 'not-the-phase', field: 'phase', expectedPhase: this.phase };
    const problem = phaseProblem ?? JobFileShapeUtil.firstMistypedFieldOf(document, {
      phaseHash:         [JobFileShapeUtil.valueIsText, 'text'],
      entityPhaseHashes: [JobFileShapeUtil.optional(JobFileShapeUtil.valueIsATextRecord), 'a-record-of-phase-hashes'],
    }) ?? listProblemOf(document, 'prepare', PREPARE_STEP_CHECKS) ?? listProblemOf(document, 'gates', GATE_CHECKS);
    if (problem !== null) return { verdict: 'unreadable', problem };
    return { verdict: 'readable', manifest: manifestOf(document) };
  }
}
