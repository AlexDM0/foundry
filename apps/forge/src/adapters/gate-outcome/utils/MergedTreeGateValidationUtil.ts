/** Each field of a kept merged-tree gate, checked against the shape the gate run wrote: the first problem, or `null` when there is none. */
import { JsonRecordUtil }                             from '../../../lib/json-record/JsonRecordUtil.ts';
import { GATE_PHASES }                                from '../../../lib/tracker-model/@types/GatePhase.ts';
import { GATE_CACHE_REPORTS }                         from '../../../lib/tracker-model/constants/GateProfileVocabulary.ts';
import { PIPELINE_STEP_ENDINGS, PIPELINE_STEP_KINDS } from '../../../lib/tracker-model/constants/JobStates.ts';
import type { MergedTreeGate }                        from '../@types/MergedTreeGate.ts';
import type { MergedTreeGateProblem }                 from '../@types/MergedTreeGateOutcomeProblem.ts';

const KEPT_GATE_OUTCOMES: readonly unknown[] = ['passed', 'failed', 'cannot-run', 'setup-failed', 'sandbox-unavailable'] satisfies MergedTreeGate['outcome'][];

const GATE_PHASE_VALUES: readonly unknown[] = GATE_PHASES;

const CACHE_REPORT_VALUES: readonly unknown[] = GATE_CACHE_REPORTS;

const STEP_KIND_VALUES: readonly unknown[] = PIPELINE_STEP_KINDS;

const STEP_ENDING_VALUES: readonly unknown[] = PIPELINE_STEP_ENDINGS;

function isATextRecord(value: unknown): boolean {
  return JsonRecordUtil.valueIsAPlainObject(value) && Object.values(value).every((entry) => typeof entry === 'string');
}

function stampProblemOf(stamp: unknown): MergedTreeGateProblem | null {
  if (stamp === null) return null;
  if (!JsonRecordUtil.valueIsAPlainObject(stamp) || !GATE_PHASE_VALUES.includes(stamp['phase']) || typeof stamp['phaseHash'] !== 'string') {
    return { code: 'neither-null-nor-a-stamp', field: 'gate.stamp' };
  }
  return stamp['entityPhaseHashes'] === undefined || isATextRecord(stamp['entityPhaseHashes']) ? null : { code: 'not-a-hash-by-entity', field: 'gate.stamp.entityPhaseHashes' };
}

function cacheReportsProblemOf(cacheReports: unknown): MergedTreeGateProblem | null {
  if (cacheReports === undefined) return null;
  const isWellFormed = JsonRecordUtil.valueIsAPlainObject(cacheReports) && GATE_PHASE_VALUES.includes(cacheReports['phase'])
    && Array.isArray(cacheReports['gates']) && cacheReports['gates'].every((gate: unknown) => JsonRecordUtil.valueIsAPlainObject(gate)
      && typeof gate['gateName'] === 'string' && (gate['cacheReport'] === null || CACHE_REPORT_VALUES.includes(gate['cacheReport'])));
  return isWellFormed ? null : { code: 'not-cache-reports', field: 'gate.cacheReports' };
}

function stepRunIsWellFormed(stepRun: unknown): boolean {
  return JsonRecordUtil.valueIsAPlainObject(stepRun) && STEP_KIND_VALUES.includes(stepRun['stepKind']) && typeof stepRun['stepName'] === 'string'
    && (stepRun['entity'] === undefined || typeof stepRun['entity'] === 'string')
    && typeof stepRun['runMilliseconds'] === 'number' && STEP_ENDING_VALUES.includes(stepRun['ending']);
}

function stepRunsProblemOf(stepRuns: unknown): MergedTreeGateProblem | null {
  if (stepRuns === undefined) return null;
  const isWellFormed = JsonRecordUtil.valueIsAPlainObject(stepRuns) && GATE_PHASE_VALUES.includes(stepRuns['phase'])
    && Array.isArray(stepRuns['steps']) && stepRuns['steps'].every(stepRunIsWellFormed);
  return isWellFormed ? null : { code: 'not-step-runs', field: 'gate.stepRuns' };
}

function gateProblemOf(gate: unknown): MergedTreeGateProblem | null {
  if (!JsonRecordUtil.valueIsAPlainObject(gate)) return { code: 'gate-not-an-object', field: 'gate' };
  if (!KEPT_GATE_OUTCOMES.includes(gate['outcome'])) return { code: 'not-a-gate-outcome', field: 'gate.outcome' };
  if (gate['step'] !== null && typeof gate['step'] !== 'string') return { code: 'neither-null-nor-a-step-name', field: 'gate.step' };
  if (gate['entity'] !== undefined && typeof gate['entity'] !== 'string') return { code: 'not-an-entity-key', field: 'gate.entity' };
  if (typeof gate['output'] !== 'string') return { code: 'output-not-text', field: 'gate.output' };
  return stampProblemOf(gate['stamp']) ?? cacheReportsProblemOf(gate['cacheReports']) ?? stepRunsProblemOf(gate['stepRuns']);
}

export const MergedTreeGateValidationUtil = Object.freeze({ gateProblemOf, stampProblemOf });
