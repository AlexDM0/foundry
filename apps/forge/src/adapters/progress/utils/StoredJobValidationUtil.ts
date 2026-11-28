/**
 * Whether the parsed `jobs`, `nextJobId` and `needs` of a progress.json are in the current format, and if not, the problem naming the offending
 * field.
 */
import {
  FIRST_CHILD_INSTANCE,
  FIRST_JOB_NUMBER,
  INTERRUPTION_CAUSES,
  JOB_ID_PREFIX,
  JOB_KINDS,
  JOB_NOT_LAUNCHED_CAUSES,
  JOB_OUTCOMES,
  JOB_ROLES,
  JOB_STATES,
  JOB_STOP_MODES,
  AIRLOCK_PHASES
}                          from '../../../domain/tracker-model/constants/JobStates.ts';
import { OptionConsequencesUtil }                                                 from '../../../domain/tracker-model/utils/OptionConsequencesUtil.ts';
import { JsonRecordUtil }                                                         from '../../../lib/json-record/JsonRecordUtil.ts';
import type { ProgressFieldExpectation, ProgressFileProblem, ProgressVocabulary } from '../../../shared/@types/ProgressFileProblem.ts';
import { StoredValueUtil }                                                        from '../../utils/StoredValueUtil.ts';

const FIRST_ATTEMPT = 1;

const FIRST_EVENT_SEQUENCE = 0;

const FIRST_STAGE = 1;

type Problem = ProgressFileProblem | null;

function storedJsonOf(value: unknown): string {
  return String(JSON.stringify(value));
}

function vocabularyProblem(value: unknown, path: string, vocabulary: ProgressVocabulary, words: readonly string[]): Problem {
  if (typeof value === 'string' && words.includes(value)) return null;
  return {
    code: 'not-in-vocabulary', field: path, storedJson: storedJsonOf(value), vocabulary
  };
}

function fieldIsNot(field: string, expected: ProgressFieldExpectation): ProgressFileProblem {
  return { code: 'field-is-not', field, expected };
}

function neitherNorNull(field: string, expected: ProgressFieldExpectation): ProgressFileProblem {
  return { code: 'field-is-neither-nor-null', field, expected };
}

function notAtLeast(field: string, least: number): ProgressFileProblem {
  return { code: 'field-is-not-at-least', field, least };
}

function presentButNot(field: string, expected: ProgressFieldExpectation): ProgressFileProblem {
  return { code: 'present-field-is-not', field, expected };
}

function listOfTextIsWellFormed(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function nullableText(value: unknown): boolean {
  return value === null || typeof value === 'string';
}

function jobIdIsWellFormed(value: unknown): value is string {
  return typeof value === 'string' && new RegExp(`^${JOB_ID_PREFIX}[1-9][0-9]*$`).test(value);
}

function jobIdProblem(value: unknown, path: string): Problem {
  return jobIdIsWellFormed(value) ? null : {
    code: 'not-a-numbered-id', field: path, storedJson: storedJsonOf(value), prefix: JOB_ID_PREFIX
  };
}

function eventCursorProblem(value: unknown, path: string): Problem {
  if (!JsonRecordUtil.valueIsAPlainObject(value)) return fieldIsNot(path, 'an-object');
  if (!StoredValueUtil.wholeNumberIsAtLeast(value['instance'], FIRST_CHILD_INSTANCE)) return notAtLeast(`${path}.instance`, FIRST_CHILD_INSTANCE);
  if (!StoredValueUtil.wholeNumberIsAtLeast(value['sequence'], FIRST_EVENT_SEQUENCE)) return notAtLeast(`${path}.sequence`, FIRST_EVENT_SEQUENCE);
  return null;
}

function airlockProblem(value: unknown, path: string): Problem {
  if (!JsonRecordUtil.valueIsAPlainObject(value)) return presentButNot(path, 'an-object');
  for (const field of ['target', 'targetTip', 'branchTip']) {
    if (typeof value[field] !== 'string') return fieldIsNot(`${path}.${field}`, 'a-string');
  }
  return vocabularyProblem(value['phase'], `${path}.phase`, 'airlock-phase', AIRLOCK_PHASES);
}

function answerMapIsWellFormed(value: unknown): boolean {
  return JsonRecordUtil.valueIsAPlainObject(value) && Object.values(value).every((answer) => typeof answer === 'string');
}

function intakeProblem(value: unknown, path: string): Problem {
  if (!JsonRecordUtil.valueIsAPlainObject(value)) return presentButNot(path, 'an-object');
  if (typeof value['text'] !== 'string') return fieldIsNot(`${path}.text`, 'a-string');
  if (value['title'] !== undefined && typeof value['title'] !== 'string') return fieldIsNot(`${path}.title`, 'a-string');
  if (value['pictures'] !== undefined && !StoredValueUtil.picturesAreWellFormed(value['pictures'])) return fieldIsNot(`${path}.pictures`, 'a-list-of-pictures');
  const { proposedDraftSets, carriedAnswers } = value;
  if (proposedDraftSets !== undefined && !(Array.isArray(proposedDraftSets) && proposedDraftSets.every(listOfTextIsWellFormed))) {
    return fieldIsNot(`${path}.proposedDraftSets`, 'a-list-of-ticket-id-lists');
  }
  if (carriedAnswers !== undefined && !(Array.isArray(carriedAnswers) && carriedAnswers.every(answerMapIsWellFormed))) {
    return fieldIsNot(`${path}.carriedAnswers`, 'a-list-of-answers');
  }
  return null;
}

/** Each entry is held to the rule `question options` reads its notes by, so a stored note is one the command could have written. */
function pendingOptionNotesProblem(value: unknown, path: string): Problem {
  if (!Array.isArray(value)) return presentButNot(path, 'a-list');
  for (const [i, notes] of value.entries()) {
    const reading = OptionConsequencesUtil.notesReadingOf(notes);
    if (reading.verdict === 'malformed') return {
      code: 'malformed-option-note', field: `${path}[${i}]`, noteField: reading.field, noteProblem: reading.problem
    };
  }
  return null;
}

function entityAndStageProblem(job: Record<string, unknown>, path: string): Problem {
  const { entity, stage } = job;
  if (entity !== undefined && (typeof entity !== 'string' || entity.trim() === '')) return presentButNot(`${path}.entity`, 'an-entity-key');
  if (stage !== undefined && !StoredValueUtil.wholeNumberIsAtLeast(stage, FIRST_STAGE)) {
    return {
      code: 'present-field-is-not-at-least', field: `${path}.stage`, unit: 'whole-number', least: FIRST_STAGE
    };
  }
  return null;
}

function notLaunchedProblem(value: unknown, path: string): Problem {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return fieldIsNot(path, 'an-object');
  const { cause, programPath } = value as Record<string, unknown>;
  return vocabularyProblem(cause, `${path}.cause`, 'job-not-launched-cause', JOB_NOT_LAUNCHED_CAUSES)
    ?? (nullableText(programPath) ? null : neitherNorNull(`${path}.programPath`, 'a-path'));
}

function jobOptionalFieldsProblem(job: Record<string, unknown>, path: string): Problem {
  const presentProblems: readonly [string, (value: unknown) => Problem][] = [
    ['interruption', (value) => vocabularyProblem(value, `${path}.interruption`, 'interruption-cause', INTERRUPTION_CAUSES)],
    ['airlock', (value) => airlockProblem(value, `${path}.airlock`)],
    ['stopRequest', (value) => vocabularyProblem(value, `${path}.stopRequest`, 'job-stop-mode', JOB_STOP_MODES)],
    ['notLaunched', (value) => notLaunchedProblem(value, `${path}.notLaunched`)],
    ['intake', (value) => intakeProblem(value, `${path}.intake`)],
    ['pendingOptionNotes', (value) => pendingOptionNotesProblem(value, `${path}.pendingOptionNotes`)],
    ['outcome', (value) => vocabularyProblem(value, `${path}.outcome`, 'job-outcome', JOB_OUTCOMES)],
  ];
  for (const [field, problemOf] of presentProblems) {
    const problem = job[field] === undefined ? null : problemOf(job[field]);
    if (problem !== null) return problem;
  }
  return entityAndStageProblem(job, path);
}

function jobProblem(value: unknown, index: number): Problem {
  const path = `jobs[${index}]`;
  if (!JsonRecordUtil.valueIsAPlainObject(value)) return fieldIsNot(path, 'an-object');
  const idProblem = jobIdProblem(value['id'], `${path}.id`);
  if (idProblem !== null) return idProblem;
  // A kind or role an earlier release wrote, such as a renamed one, is a live job only that release can stop.
  const kindProblem = vocabularyProblem(value['kind'], `${path}.kind`, 'job-kind', JOB_KINDS);
  if (kindProblem !== null) return kindProblem;
  if (value['role'] !== null && !(typeof value['role'] === 'string' && (JOB_ROLES as readonly string[]).includes(value['role']))) {
    return { code: 'neither-null-nor-a-job-role', field: `${path}.role`, storedJson: storedJsonOf(value['role']) };
  }
  if (!listOfTextIsWellFormed(value['ticketIds'])) return fieldIsNot(`${path}.ticketIds`, 'a-list-of-ticket-ids');
  if (!nullableText(value['parentJobId'])) return neitherNorNull(`${path}.parentJobId`, 'a-job-id');
  if (!StoredValueUtil.wholeNumberIsAtLeast(value['attempt'], FIRST_ATTEMPT)) return notAtLeast(`${path}.attempt`, FIRST_ATTEMPT);
  if (!nullableText(value['target'])) return neitherNorNull(`${path}.target`, 'a-branch');
  const stateProblem = vocabularyProblem(value['state'], `${path}.state`, 'job-state', JOB_STATES);
  if (stateProblem !== null) return stateProblem;
  if (!StoredValueUtil.wholeNumberIsAtLeast(value['childInstance'], FIRST_CHILD_INSTANCE)) return notAtLeast(`${path}.childInstance`, FIRST_CHILD_INSTANCE);
  const cursorProblem = eventCursorProblem(value['eventCursor'], `${path}.eventCursor`);
  if (cursorProblem !== null) return cursorProblem;
  if (!listOfTextIsWellFormed(value['answeredRequestIds'])) return fieldIsNot(`${path}.answeredRequestIds`, 'a-list-of-request-ids');
  if (!StoredValueUtil.wholeNumberIsAtLeast(value['crashResumes'], 0)) return notAtLeast(`${path}.crashResumes`, 0);
  return jobOptionalFieldsProblem(value, path);
}

/** `null` when both are absent or well formed; the counter is checked first, then each job in order. */
function jobsProblemOf(document: Record<string, unknown>): Problem {
  const { nextJobId, jobs } = document;
  if (nextJobId !== undefined && !StoredValueUtil.wholeNumberIsAtLeast(nextJobId, FIRST_JOB_NUMBER)) {
    return {
      code: 'present-counter-below-first', field: 'nextJobId', storedJson: storedJsonOf(nextJobId), least: FIRST_JOB_NUMBER
    };
  }
  if (jobs === undefined) return null;
  if (!Array.isArray(jobs)) return presentButNot('jobs', 'an-array');
  for (const [index, job] of jobs.entries()) {
    const problem = jobProblem(job, index);
    if (problem !== null) return problem;
  }
  return null;
}

function needProblem(value: unknown, index: number): Problem {
  const path = `needs[${index}]`;
  if (!JsonRecordUtil.valueIsAPlainObject(value)) return fieldIsNot(path, 'an-object');
  const idProblem = jobIdProblem(value['jobId'], `${path}.jobId`);
  if (idProblem !== null) return idProblem;
  if (!listOfTextIsWellFormed(value['ticketIds'])) return fieldIsNot(`${path}.ticketIds`, 'a-list-of-ticket-ids');
  for (const field of ['entity', 'title', 'body']) {
    if (typeof value[field] !== 'string') return fieldIsNot(`${path}.${field}`, 'a-string');
  }
  return null;
}

/** `null` when the needs build jobs declared are absent or well formed, each in order. */
function needsProblemOf(document: Record<string, unknown>): Problem {
  const { needs } = document;
  if (needs === undefined) return null;
  if (!Array.isArray(needs)) return presentButNot('needs', 'an-array');
  for (const [index, need] of needs.entries()) {
    const problem = needProblem(need, index);
    if (problem !== null) return problem;
  }
  return null;
}

export const StoredJobValidationUtil = { jobProblem, jobsProblemOf, needsProblemOf } as const;
