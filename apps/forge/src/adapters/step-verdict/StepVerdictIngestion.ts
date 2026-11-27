/** `<step folder>-verdict.json`, a gate run step's verdict as the job first read it, read into the verdict: read, validate, map. */
import { JsonRecordUtil }                                            from '../../lib/json-record/JsonRecordUtil.ts';
import { GATE_PHASES, type GateRunStamp }                            from '../../lib/tracker-model/@types/GatePhase.ts';
import type { GateCacheReport, GateOutcome, PipelineStepRun }        from '../../lib/tracker-model/@types/Job.ts';
import { GATE_CACHE_REPORTS }                                        from '../../lib/tracker-model/constants/GateProfileVocabulary.ts';
import { GATE_OUTCOMES, PIPELINE_STEP_ENDINGS, PIPELINE_STEP_KINDS } from '../../lib/tracker-model/constants/JobStates.ts';
import type { JobFileFieldProblem }                                  from '../@types/JobFileFieldProblem.ts';
import { JobFileShapeUtil }                                          from '../utils/JobFileShapeUtil.ts';
import { StoredJsonDocumentUtil }                                    from '../utils/StoredJsonDocumentUtil.ts';
import type { StepVerdictProblem }                                   from './@types/StepVerdictProblem.ts';

export const STEP_VERDICT_FORMAT_VERSION = 1;

/** A prepare step that does not pass is a setup failure, never a gate's red. */
export type GateStepOutcome = GateOutcome | 'setup-failed';

/** Kept beside the step's folder with the stamp of the manifest it ran under, and reused only on the same tree under an equal manifest. */
export interface StepVerdict extends GateRunStamp {
  treeId:       string;
  outcome:      GateStepOutcome;
  output:       string;
  exitCode?:    number | null;
  /** What a gate reported of its cache; written only once it reported. */
  cacheReport?: GateCacheReport;
  /** The step's line with its run time; absent when the line never ran. */
  stepRun?:     PipelineStepRun;
}

export type StepVerdictReading =
  | { verdict: 'readable'; stepVerdict: StepVerdict }
  | { verdict: 'absent' }
  | { verdict: 'unreadable'; problem: StepVerdictProblem };

const GATE_STEP_OUTCOMES: readonly GateStepOutcome[] = [...GATE_OUTCOMES, 'setup-failed'];

function valueIsARunTime(value: unknown): boolean {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function stepRunProblemOf(stepRun: unknown): JobFileFieldProblem | null {
  if (stepRun === undefined) return null;
  if (!JsonRecordUtil.valueIsAPlainObject(stepRun)) return { code: 'field-is-not', field: 'stepRun', expected: 'an-object' };
  return JobFileShapeUtil.firstMistypedFieldOf(stepRun, {
    stepKind:        [JobFileShapeUtil.oneOf(PIPELINE_STEP_KINDS), 'a-step-kind'],
    stepName:        [JobFileShapeUtil.valueIsText, 'text'],
    entity:          [JobFileShapeUtil.optional(JobFileShapeUtil.valueIsText), 'an-entity-key'],
    runMilliseconds: [valueIsARunTime, 'a-run-time'],
    ending:          [JobFileShapeUtil.oneOf(PIPELINE_STEP_ENDINGS), 'a-step-ending'],
  }, 'stepRun.');
}

function stepRunOf(stored: Readonly<Record<string, unknown>>): PipelineStepRun {
  const entity = stored['entity'] as string | undefined;
  return {
    stepKind:        stored['stepKind'] as PipelineStepRun['stepKind'],
    stepName:        stored['stepName'] as string,
    ...(entity === undefined ? {} : { entity }),
    runMilliseconds: stored['runMilliseconds'] as number,
    ending:          stored['ending'] as PipelineStepRun['ending'],
  };
}

function stepVerdictOf(document: Readonly<Record<string, unknown>>): StepVerdict {
  const entityPhaseHashes = document['entityPhaseHashes'] as Record<string, string> | undefined;
  const exitCode = document['exitCode'] as number | null | undefined;
  const cacheReport = document['cacheReport'] as GateCacheReport | undefined;
  const stepRun = document['stepRun'] as Record<string, unknown> | undefined;
  return {
    treeId:    document['treeId'] as string,
    phase:     document['phase'] as StepVerdict['phase'],
    phaseHash: document['phaseHash'] as string,
    ...(entityPhaseHashes === undefined ? {} : { entityPhaseHashes: { ...entityPhaseHashes } }),
    outcome:   document['outcome'] as GateStepOutcome,
    output:    document['output'] as string,
    ...(exitCode === undefined ? {} : { exitCode }),
    ...(cacheReport === undefined ? {} : { cacheReport }),
    ...(stepRun === undefined ? {} : { stepRun: stepRunOf(stepRun) }),
  };
}

export class StepVerdictIngestion {
  constructor(private readonly verdictFilePath: string) {}

  /** Never throws: a verdict changed by hand into any other shape is `unreadable`, never a verdict the run reuses. */
  read(): StepVerdictReading {
    const stored = StoredJsonDocumentUtil.documentAt(this.verdictFilePath, STEP_VERDICT_FORMAT_VERSION);
    if (stored.verdict !== 'readable') return stored;
    const { document } = stored;
    const problem = JobFileShapeUtil.firstMistypedFieldOf(document, {
      treeId:            [JobFileShapeUtil.valueIsText, 'text'],
      phase:             [JobFileShapeUtil.oneOf(GATE_PHASES), 'a-gate-phase'],
      phaseHash:         [JobFileShapeUtil.valueIsText, 'text'],
      entityPhaseHashes: [JobFileShapeUtil.optional(JobFileShapeUtil.valueIsATextRecord), 'a-record-of-phase-hashes'],
      outcome:           [JobFileShapeUtil.oneOf(GATE_STEP_OUTCOMES), 'a-step-outcome'],
      output:            [JobFileShapeUtil.valueIsText, 'text'],
      exitCode:          [JobFileShapeUtil.optional(JobFileShapeUtil.valueIsANumberOrNull), 'an-exit-code-or-null'],
      cacheReport:       [JobFileShapeUtil.optional(JobFileShapeUtil.oneOf(GATE_CACHE_REPORTS)), 'a-cache-report'],
    }) ?? stepRunProblemOf(document['stepRun']);
    if (problem !== null) return { verdict: 'unreadable', problem };
    return { verdict: 'readable', stepVerdict: stepVerdictOf(document) };
  }
}
