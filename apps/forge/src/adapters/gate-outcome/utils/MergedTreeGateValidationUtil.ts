/** Each field of a kept merged-tree gate, checked against the shape the gate run wrote: the first problem, or `null` when there is none. */
import { GATE_PHASES }                                from '../../../domain/tracker-model/@types/GatePhase.ts';
import { GATE_CACHE_REPORTS }                         from '../../../domain/tracker-model/constants/GateProfileVocabulary.ts';
import { PIPELINE_STEP_ENDINGS, PIPELINE_STEP_KINDS } from '../../../domain/tracker-model/constants/JobStates.ts';
import { JsonRecordUtil }                             from '../../../lib/json-record/JsonRecordUtil.ts';
import type { MergedTreeGate }                        from '../@types/MergedTreeGate.ts';

const KEPT_GATE_OUTCOMES: readonly unknown[] = ['passed', 'failed', 'cannot-run', 'setup-failed', 'sandbox-unavailable'] satisfies MergedTreeGate['outcome'][];

const GATE_PHASE_VALUES: readonly unknown[] = GATE_PHASES;

const CACHE_REPORT_VALUES: readonly unknown[] = GATE_CACHE_REPORTS;

const STEP_KIND_VALUES: readonly unknown[] = PIPELINE_STEP_KINDS;

const STEP_ENDING_VALUES: readonly unknown[] = PIPELINE_STEP_ENDINGS;

function isATextRecord(value: unknown): boolean {
  return JsonRecordUtil.valueIsAPlainObject(value) && Object.values(value).every((entry) => typeof entry === 'string');
}

function stampProblemOf(stamp: unknown): string | null {
  if (stamp === null) return null;
  if (!JsonRecordUtil.valueIsAPlainObject(stamp) || !GATE_PHASE_VALUES.includes(stamp['phase']) || typeof stamp['phaseHash'] !== 'string') {
    return '"gate.stamp" is neither null nor a phase with its hash';
  }
  return stamp['entityPhaseHashes'] === undefined || isATextRecord(stamp['entityPhaseHashes']) ? null : '"gate.stamp.entityPhaseHashes" is not a hash by entity';
}

function cacheReportsProblemOf(cacheReports: unknown): string | null {
  if (cacheReports === undefined) return null;
  const isWellFormed = JsonRecordUtil.valueIsAPlainObject(cacheReports) && GATE_PHASE_VALUES.includes(cacheReports['phase'])
    && Array.isArray(cacheReports['gates']) && cacheReports['gates'].every((gate: unknown) => JsonRecordUtil.valueIsAPlainObject(gate)
      && typeof gate['gateName'] === 'string' && (gate['cacheReport'] === null || CACHE_REPORT_VALUES.includes(gate['cacheReport'])));
  return isWellFormed ? null : '"gate.cacheReports" is not the cache reports of a gate run';
}

function stepRunIsWellFormed(stepRun: unknown): boolean {
  return JsonRecordUtil.valueIsAPlainObject(stepRun) && STEP_KIND_VALUES.includes(stepRun['stepKind']) && typeof stepRun['stepName'] === 'string'
    && (stepRun['entity'] === undefined || typeof stepRun['entity'] === 'string')
    && typeof stepRun['runMilliseconds'] === 'number' && STEP_ENDING_VALUES.includes(stepRun['ending']);
}

function stepRunsProblemOf(stepRuns: unknown): string | null {
  if (stepRuns === undefined) return null;
  const isWellFormed = JsonRecordUtil.valueIsAPlainObject(stepRuns) && GATE_PHASE_VALUES.includes(stepRuns['phase'])
    && Array.isArray(stepRuns['steps']) && stepRuns['steps'].every(stepRunIsWellFormed);
  return isWellFormed ? null : '"gate.stepRuns" is not the step lines of a gate run';
}

function gateProblemOf(gate: unknown): string | null {
  if (!JsonRecordUtil.valueIsAPlainObject(gate)) return 'its "gate" is not an object';
  if (!KEPT_GATE_OUTCOMES.includes(gate['outcome'])) return '"gate.outcome" is no gate outcome';
  if (gate['step'] !== null && typeof gate['step'] !== 'string') return '"gate.step" is neither null nor a step name';
  if (gate['entity'] !== undefined && typeof gate['entity'] !== 'string') return '"gate.entity" is not an entity key';
  if (typeof gate['output'] !== 'string') return '"gate.output" is not text';
  return stampProblemOf(gate['stamp']) ?? cacheReportsProblemOf(gate['cacheReports']) ?? stepRunsProblemOf(gate['stepRuns']);
}

export const MergedTreeGateValidationUtil = Object.freeze({ gateProblemOf, stampProblemOf });
