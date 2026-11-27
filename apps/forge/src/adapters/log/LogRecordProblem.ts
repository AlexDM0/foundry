/** Whether one parsed log.jsonl line is a well-formed record of a known kind, and if not, the problem naming the offending field. */
import { JsonRecordUtil }     from '../../lib/json-record/JsonRecordUtil.ts';
import { GATE_PHASES }        from '../../lib/tracker-model/@types/GatePhase.ts';
import type { LogRecordKind } from '../../lib/tracker-model/@types/LogRecord.ts';
import {
  DECISION_KINDS,
  INCIDENT_DEFAULT_CAUSES,
  INCIDENT_KINDS,
  INCIDENT_MOVES
}                             from '../../lib/tracker-model/constants/DecisionAndIncidentVocabulary.ts';
import { FLINT_BRAIN_ENDED_REASONS, FLINT_BRAIN_STARTERS } from '../../lib/tracker-model/constants/FlintBrainVocabulary.ts';
import { GATE_CACHE_REPORTS, GATE_PROFILE_RUN_ENDINGS }    from '../../lib/tracker-model/constants/GateProfileVocabulary.ts';
import { HEPHAESTUS_STATES }                               from '../../lib/tracker-model/constants/HephaestusStates.ts';
import {
  FIRST_CHILD_INSTANCE,
  GATE_OUTCOMES,
  LANDING_KINDS,
  INTERRUPTION_CAUSES,
  LOST_LINE_KINDS,
  JOB_KINDS,
  JOB_OUTCOMES,
  JOB_ROLES,
  HEPHAESTUS_STOP_REASONS,
  JOB_STOP_MODES,
  PIPELINE_STEP_ENDINGS,
  PIPELINE_STEP_KINDS,
  START_KINDS,
  START_ORIGINS
}                                                            from '../../lib/tracker-model/constants/JobStates.ts';
import type { LogFieldShape } from '../../lib/tracker-model/constants/LogRecordSchema.ts';
import {
  HATCH_REFUSAL_STATUSES,
  LOG_RECORD_SCHEMA,
  LOG_RECORD_SUBJECT_IDS,
  RETIRED_DISPATCHER_STATES
} from '../../lib/tracker-model/constants/LogRecordSchema.ts';
import {
  PIPELINE_BILLING_MODES,
  PIPELINE_SETUP_MODES,
  PIPELINE_SETUP_STEP_STATES,
  PIPELINE_SETUP_STEPS
} from '../../lib/tracker-model/constants/PipelineSetupVocabulary.ts';
import { FIRST_REPEAT_REVIEW_ROUND, FIRST_REVIEW_BAR_ROUND } from '../../lib/tracker-model/constants/ReviewRounds.ts';
import { ENTITY_ASSIGNERS, TICKET_PRIORITIES, TICKET_SIZES } from '../../lib/tracker-model/constants/TicketFields.ts';
import { BoardSettingsUtil }                                 from '../../lib/tracker-model/utils/BoardSettingsUtil.ts';
import { VocabularyUtil }                                    from '../../lib/tracker-model/utils/VocabularyUtil.ts';
import type { LogListItems, LogRecordProblem }               from '../../shared/@types/LogFileProblem.ts';
import { StoredValueUtil }                                   from '../utils/StoredValueUtil.ts';
import { LogRecordMappingUtil }                              from './utils/LogRecordMappingUtil.ts';
import { ReviewRecordFieldsUtil }                            from './utils/ReviewRecordFieldsUtil.ts';

type UnknownObject = Record<string, unknown>;

/** `path` is the field as the problem names it, `fields.<name>`. */
type FieldShapeCheck = (value: unknown, path: string) => LogRecordProblem | null;

/** A stored value as its JSON text, as a problem names it; `undefined` for a missing one, which JSON cannot write. */
function storedValueTextOf(value: unknown): string | undefined {
  return JSON.stringify(value) as string | undefined;
}

function textProblem(value: unknown, path: string): LogRecordProblem | null {
  return typeof value === 'string' ? null : { code: 'field-not-text', field: path };
}

function listOfTextProblem(value: unknown, path: string, items: LogListItems): LogRecordProblem | null {
  const isListOfText = Array.isArray(value) && value.every((item) => typeof item === 'string');
  return isListOfText ? null : { code: 'field-not-a-list-of', field: path, items };
}

function notOneOfProblem(value: unknown, path: string, vocabulary: readonly string[]): LogRecordProblem {
  return {
    code: 'field-not-one-of', field: path, storedValue: storedValueTextOf(value), allowedValues: vocabulary
  };
}

function vocabularyProblem(value: unknown, path: string, vocabulary: readonly string[]): LogRecordProblem | null {
  return typeof value === 'string' && vocabulary.includes(value) ? null : notOneOfProblem(value, path, vocabulary);
}

function setupStepsProblem(value: unknown, path: string): LogRecordProblem | null {
  const steps: readonly unknown[] = PIPELINE_SETUP_STEPS;
  const isListOfSteps = Array.isArray(value) && value.every((item) => steps.includes(item));
  return isListOfSteps ? null : { code: 'field-not-setup-steps', field: path };
}

function costIsWellFormed(value: unknown): boolean {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function picturesProblem(value: unknown, path: string): LogRecordProblem | null {
  if (value === undefined || StoredValueUtil.picturesAreWellFormed(value)) return null;
  return { code: 'field-not-pictures', field: path };
}

function refusalDetailProblem(value: unknown, path: string): LogRecordProblem | null {
  if (value === undefined || (JsonRecordUtil.valueIsAPlainObject(value) && typeof value['kind'] === 'string')) return null;
  return { code: 'field-not-a-refusal-detail', field: path };
}

function gateCacheReportOfGateIsWellFormed(value: unknown): boolean {
  if (!JsonRecordUtil.valueIsAPlainObject(value) || typeof value['gateName'] !== 'string') return false;
  const cacheReports: readonly unknown[] = GATE_CACHE_REPORTS;
  return value['cacheReport'] === null || cacheReports.includes(value['cacheReport']);
}

function gateCacheReportsProblem(value: unknown, path: string): LogRecordProblem | null {
  if (value === undefined) return null;
  const phases: readonly unknown[] = GATE_PHASES;
  const isWellFormed = JsonRecordUtil.valueIsAPlainObject(value) && phases.includes(value['phase'])
    && Array.isArray(value['gates']) && value['gates'].every(gateCacheReportOfGateIsWellFormed);
  return isWellFormed ? null : { code: 'field-not-cache-reports', field: path };
}

function checkCommandProblem(value: unknown, path: string): LogRecordProblem | null {
  return value === null || BoardSettingsUtil.checkCommandIsWellFormed(value) ? null : { code: 'field-not-a-check-command', field: path };
}

function wholeNumberAtLeastProblem(value: unknown, path: string, minimum: number): LogRecordProblem | null {
  return StoredValueUtil.wholeNumberIsAtLeast(value, minimum) ? null : { code: 'field-below-minimum', field: path, minimum };
}

function decisionAnswerProblem(value: unknown, path: string): LogRecordProblem | null {
  const answers = JsonRecordUtil.valueIsAPlainObject(value) ? Object.values(value) : [];
  const isMapOfText = answers.length > 0 && answers.every((answer) => typeof answer === 'string');
  return isMapOfText ? null : { code: 'field-not-answers', field: path };
}

function priorityProblem(value: unknown, path: string): LogRecordProblem | null {
  return typeof value === 'string' && VocabularyUtil.ticketPriorityIsKnown(value) ? null : notOneOfProblem(value, path, TICKET_PRIORITIES);
}

function ticketSizeProblem(value: unknown, path: string): LogRecordProblem | null {
  return typeof value === 'string' && VocabularyUtil.ticketSizeIsKnown(value) ? null : notOneOfProblem(value, path, TICKET_SIZES);
}

function agentPairProblem(value: unknown, path: string): LogRecordProblem | null {
  if (!JsonRecordUtil.valueIsAPlainObject(value)) return { code: 'field-not-an-object', field: path };
  const { model, effort } = value;
  if (typeof model !== 'string' || !VocabularyUtil.agentModelIsKnown(model)) return { code: 'model-unknown', field: `${path}.model`, storedValue: storedValueTextOf(model) };
  if (typeof effort !== 'string' || !VocabularyUtil.agentEffortIsKnown(effort)) return { code: 'effort-unknown', field: `${path}.effort`, storedValue: storedValueTextOf(effort) };
  return null;
}

function roundProblem(value: unknown, path: string, minimum: number): LogRecordProblem | null {
  return StoredValueUtil.wholeNumberIsAtLeast(value, minimum) ? null : { code: 'round-below-minimum', field: path, minimum };
}

function hephaestusStateProblem(value: unknown, path: string): LogRecordProblem | null {
  return BoardSettingsUtil.hephaestusStateIsKnown(value) ? null : notOneOfProblem(value, path, HEPHAESTUS_STATES);
}

function countProblem(value: unknown, path: string): LogRecordProblem | null {
  return wholeNumberAtLeastProblem(value, path, 0);
}

function retiredDispatcherRunIdProblem(value: unknown, path: string): LogRecordProblem | null {
  return value === null || (typeof value === 'string' && value.trim() !== '') ? null : { code: 'field-not-a-run-id', field: path };
}

function flagProblem(value: unknown, path: string): LogRecordProblem | null {
  return typeof value === 'boolean' ? null : { code: 'field-not-a-flag', field: path };
}

const CHECK_FOR_FIELD_SHAPE: Readonly<Record<LogFieldShape, FieldShapeCheck>> = {
  'text':                     textProblem,
  // The same rule as a task's own `id`, so every id a row can hold is one a review-bar record can name.
  'task-id':                  (value, path) => (StoredValueUtil.valueIsAWholeNumber(value) ? null : { code: 'field-not-a-whole-number', field: path }),
  'optional-text':            (value, path) => (value === undefined ? null : textProblem(value, path)),
  'priority':                 priorityProblem,
  'ticket-size':              ticketSizeProblem,
  'optional-size':            (value, path) => (value === undefined ? null : ticketSizeProblem(value, path)),
  'agent-pair':               agentPairProblem,
  'ticket-ids':               (value, path) => listOfTextProblem(value, path, 'ticket-ids'),
  'epic-keys':                (value, path) => listOfTextProblem(value, path, 'epic-keys'),
  'network-domains':          (value, path) => listOfTextProblem(value, path, 'domains'),
  'review-round':             (value, path) => roundProblem(value, path, FIRST_REPEAT_REVIEW_ROUND),
  'chart-range':              (value, path) => (BoardSettingsUtil.viewRangeIsWellFormed(value) ? null : { code: 'field-not-a-chart-range', field: path }),
  'concurrency-limit':        (value, path) => (BoardSettingsUtil.concurrencyLimitIsWellFormed(value) ? null : { code: 'field-not-an-agent-count', field: path }),
  'hephaestus-state':         hephaestusStateProblem,
  'dispatcher-state':         (value, path) => vocabularyProblem(value, path, RETIRED_DISPATCHER_STATES),
  'dispatcher-run-id':        retiredDispatcherRunIdProblem,
  'check-command':            checkCommandProblem,
  'count':                    countProblem,
  'optional-count':           (value, path) => (value === undefined ? null : countProblem(value, path)),
  'review-bar-round':         (value, path) => roundProblem(value, path, FIRST_REVIEW_BAR_ROUND),
  'review-verdict':           ReviewRecordFieldsUtil.verdictProblem,
  'review-claims':            ReviewRecordFieldsUtil.claimsProblem,
  'review-findings':          ReviewRecordFieldsUtil.findingsProblem,
  'nullable-text':            (value, path) => (value === null ? null : textProblem(value, path)),
  'job-kind':                 (value, path) => vocabularyProblem(LogRecordMappingUtil.currentJobNameOf(value), path, JOB_KINDS),
  'job-role':                 (value, path) => (value === null ? null : vocabularyProblem(LogRecordMappingUtil.currentJobNameOf(value), path, JOB_ROLES)),
  'job-outcome':              (value, path) => vocabularyProblem(value, path, JOB_OUTCOMES),
  'interruption-cause':       (value, path) => vocabularyProblem(value, path, INTERRUPTION_CAUSES),
  'child-instance':           (value, path) => wholeNumberAtLeastProblem(value, path, FIRST_CHILD_INSTANCE),
  'permission-names':         (value, path) => listOfTextProblem(value, path, 'permission-names'),
  'hephaestus-stop-reason':   (value, path) => vocabularyProblem(value, path, HEPHAESTUS_STOP_REASONS),
  'start-kind':               (value, path) => vocabularyProblem(value, path, START_KINDS),
  'start-origin':             (value, path) => vocabularyProblem(value, path, START_ORIGINS),
  'job-stop-mode':            (value, path) => vocabularyProblem(value, path, JOB_STOP_MODES),
  'decision-kind':            (value, path) => vocabularyProblem(value, path, DECISION_KINDS),
  'decision-answer':          decisionAnswerProblem,
  'incident-kind':            (value, path) => vocabularyProblem(value, path, INCIDENT_KINDS),
  'incident-move':            (value, path) => vocabularyProblem(value, path, INCIDENT_MOVES),
  'incident-default-cause':   (value, path) => vocabularyProblem(value, path, INCIDENT_DEFAULT_CAUSES),
  'gate-outcome':             (value, path) => vocabularyProblem(value, path, GATE_OUTCOMES),
  'file-paths':               (value, path) => listOfTextProblem(value, path, 'file-paths'),
  'gate-phase':               (value, path) => vocabularyProblem(value, path, GATE_PHASES),
  'gate-names':               (value, path) => listOfTextProblem(value, path, 'gate-names'),
  'customs-checks':           (value, path) => listOfTextProblem(value, path, 'customs-checks'),
  'landing-kind':             (value, path) => vocabularyProblem(value, path, LANDING_KINDS),
  'flag':                     flagProblem,
  'optional-flag':            (value, path) => (value === undefined ? null : flagProblem(value, path)),
  'optional-cost-usd':        (value, path) => (value === undefined || costIsWellFormed(value) ? null : { code: 'field-not-a-cost', field: path }),
  'optional-pictures':        picturesProblem,
  'optional-ticket-ids':      (value, path) => (value === undefined ? null : listOfTextProblem(value, path, 'ticket-ids')),
  'optional-refusal-status':  (value, path) => (value === undefined ? null : vocabularyProblem(value, path, HATCH_REFUSAL_STATUSES)),
  'optional-refusal-detail':  refusalDetailProblem,
  'optional-cache-reports':   gateCacheReportsProblem,
  'pipeline-step-kind':       (value, path) => vocabularyProblem(value, path, PIPELINE_STEP_KINDS),
  'lost-line-kind':           (value, path) => vocabularyProblem(value, path, LOST_LINE_KINDS),
  'optional-gate-phase':      (value, path) => (value === undefined ? null : vocabularyProblem(value, path, GATE_PHASES)),
  'pipeline-step-ending':     (value, path) => vocabularyProblem(value, path, PIPELINE_STEP_ENDINGS),
  'setup-mode':               (value, path) => vocabularyProblem(value, path, PIPELINE_SETUP_MODES),
  'billing-mode':             (value, path) => vocabularyProblem(value, path, PIPELINE_BILLING_MODES),
  'setup-step':               (value, path) => vocabularyProblem(value, path, PIPELINE_SETUP_STEPS),
  'setup-step-state':         (value, path) => vocabularyProblem(value, path, PIPELINE_SETUP_STEP_STATES),
  'setup-steps':              setupStepsProblem,
  'setup-item-ids':           (value, path) => listOfTextProblem(value, path, 'setup-item-ids'),
  'draft-fields':             (value, path) => listOfTextProblem(value, path, 'draft-fields'),
  'gate-profile-ending':      (value, path) => vocabularyProblem(value, path, GATE_PROFILE_RUN_ENDINGS),
  'flint-brain-starter':      (value, path) => vocabularyProblem(value, path, FLINT_BRAIN_STARTERS),
  'flint-brain-ended-reason': (value, path) => vocabularyProblem(value, path, FLINT_BRAIN_ENDED_REASONS),
  'entity-assigner':          (value, path) => vocabularyProblem(value, path, ENTITY_ASSIGNERS),
};

function kindIsKnown(kind: unknown): kind is LogRecordKind {
  return typeof kind === 'string' && Object.hasOwn(LOG_RECORD_SCHEMA, kind);
}

function shapesProblemOf(values: UnknownObject, shapes: Readonly<Record<string, LogFieldShape>>, pathPrefix: string): LogRecordProblem | null {
  for (const [name, shape] of Object.entries(shapes)) {
    const problem = CHECK_FOR_FIELD_SHAPE[shape](values[name], `${pathPrefix}${name}`);
    if (problem !== null) return problem;
  }
  return null;
}

function kindProblemOf(kind: LogRecordKind, record: UnknownObject, fields: UnknownObject): LogRecordProblem | null {
  const { subject, fields: fieldShapes } = LOG_RECORD_SCHEMA[kind];
  return shapesProblemOf(record, LOG_RECORD_SUBJECT_IDS[subject], '') ?? shapesProblemOf(fields, fieldShapes, 'fields.');
}

export function logRecordProblemOf(value: unknown): LogRecordProblem | null {
  if (!JsonRecordUtil.valueIsAPlainObject(value)) return { code: 'record-not-an-object' };
  if (typeof value['at'] !== 'string') return { code: 'at-not-text' };
  const { kind } = value;
  if (!kindIsKnown(kind)) return { code: 'kind-unknown', storedValue: storedValueTextOf(kind) };
  const { fields } = value;
  if (!JsonRecordUtil.valueIsAPlainObject(fields)) return { code: 'fields-not-an-object' };
  return kindProblemOf(kind, value, fields);
}
