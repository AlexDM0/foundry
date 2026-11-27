/**
 * Whether the parsed `decisions`, `nextDecisionId`, `incidents` and `nextIncidentId` of a progress.json are in the current format, and if
 * not, the problem naming the offending field.
 */
import { JsonRecordUtil }        from '../../../lib/json-record/JsonRecordUtil.ts';
import { TICKET_DOCUMENT_KINDS } from '../../../lib/tracker-model/@types/TicketDocument.ts';
import {
  DECISION_ID_PREFIX,
  DECISION_KINDS,
  FIRST_DECISION_NUMBER,
  FIRST_INCIDENT_NUMBER,
  INCIDENT_ID_PREFIX,
  INCIDENT_KINDS,
  INCIDENT_MOVES,
  NON_AGENT_DECISION_ASKERS
}                          from '../../../lib/tracker-model/constants/DecisionAndIncidentVocabulary.ts';
import { JOB_ROLES }                                                              from '../../../lib/tracker-model/constants/JobStates.ts';
import { OptionConsequencesUtil }                                                 from '../../../lib/tracker-model/utils/OptionConsequencesUtil.ts';
import type { ProgressFieldExpectation, ProgressFileProblem, ProgressVocabulary } from '../../../shared/@types/ProgressFileProblem.ts';
import { StoredValueUtil }                                                        from '../../utils/StoredValueUtil.ts';
import { COMMENT_VIEWS, STORED_ANCHOR_KEYS }                                      from '../constants/StoredQuestionAnchor.ts';

type UnknownObject = Record<string, unknown>;

type Problem = ProgressFileProblem | null;

const DECISION_ASKERS: readonly string[] = [...JOB_ROLES, ...NON_AGENT_DECISION_ASKERS];

const FIRST_CHAT_SEQUENCE = 1;

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

function notAtLeast(field: string, least: number): ProgressFileProblem {
  return { code: 'field-is-not-at-least', field, least };
}

function listOfTextIsWellFormed(value: unknown): boolean {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function nullableText(value: unknown): boolean {
  return value === null || typeof value === 'string';
}

function idIsWellFormed(value: unknown, prefix: string): boolean {
  return typeof value === 'string' && new RegExp(`^${prefix}[1-9][0-9]*$`).test(value);
}

function firstProblemOf(problems: readonly (() => Problem)[]): Problem {
  for (const problemOf of problems) {
    const problem = problemOf();
    if (problem !== null) return problem;
  }
  return null;
}

function optionProblem(value: unknown, path: string): Problem {
  if (!JsonRecordUtil.valueIsAPlainObject(value)) return fieldIsNot(path, 'an-object');
  if (typeof value['label'] !== 'string') return fieldIsNot(`${path}.label`, 'a-string');
  if (typeof value['description'] !== 'string') return fieldIsNot(`${path}.description`, 'a-string');
  if (typeof value['isRecommended'] !== 'boolean') return fieldIsNot(`${path}.isRecommended`, 'true-or-false');
  return OptionConsequencesUtil.factsAreWellFormed(value) ? null : { code: 'malformed-option-facts', field: path };
}

function questionProblem(value: unknown, path: string): Problem {
  if (!JsonRecordUtil.valueIsAPlainObject(value)) return fieldIsNot(path, 'an-object');
  if (typeof value['question'] !== 'string') return fieldIsNot(`${path}.question`, 'a-string');
  if (typeof value['header'] !== 'string') return fieldIsNot(`${path}.header`, 'a-string');
  if (typeof value['multiSelect'] !== 'boolean') return fieldIsNot(`${path}.multiSelect`, 'true-or-false');
  const { options } = value;
  if (!Array.isArray(options)) return fieldIsNot(`${path}.options`, 'a-list');
  return firstProblemOf(options.map((option, index) => () => optionProblem(option, `${path}.options[${index}]`)));
}

function lineRangeProblem(value: unknown, path: string): Problem {
  if (!JsonRecordUtil.valueIsAPlainObject(value)) return fieldIsNot(path, 'an-object');
  const { from, to } = value;
  if (!StoredValueUtil.wholeNumberIsAtLeast(from, 1)) return notAtLeast(`${path}.from`, 1);
  return StoredValueUtil.wholeNumberIsAtLeast(to, from) ? null : fieldIsNot(`${path}.to`, 'a-whole-number-of-at-least-its-from');
}

/** Only the code-view anchor forge makes for an agent's question is stored on a decision: no columns, quote or diagram. */
function anchorProblem(value: unknown, path: string): Problem {
  if (value === undefined) return null;
  if (!JsonRecordUtil.valueIsAPlainObject(value)) return fieldIsNot(path, 'an-object');
  const unknownKey = Object.keys(value).find((key) => !STORED_ANCHOR_KEYS.includes(key));
  return firstProblemOf([
    () => (unknownKey === undefined ? null : fieldIsNot(`${path}.${unknownKey}`, 'a-key-of-a-question-anchor')),
    () => vocabularyProblem(value['view'], `${path}.view`, 'comment-view', COMMENT_VIEWS),
    () => (StoredValueUtil.wholeNumberIsAtLeast(value['versionNumber'], 1) ? null : notAtLeast(`${path}.versionNumber`, 1)),
    () => lineRangeProblem(value['lines'], `${path}.lines`),
    () => (listOfTextIsWellFormed(value['sectionPath']) ? null : fieldIsNot(`${path}.sectionPath`, 'a-list-of-text')),
    () => lineRangeProblem(value['surroundingLines'], `${path}.surroundingLines`),
  ]);
}

/** A decision names its document only with its anchor, and its anchor only with its document. */
function documentQuestionProblem(value: UnknownObject, path: string): Problem {
  if ((value['document'] === undefined) !== (value['anchor'] === undefined)) return { code: 'document-without-anchor', field: path };
  if (value['document'] === undefined) return null;
  return vocabularyProblem(value['document'], `${path}.document`, 'ticket-document-kind', TICKET_DOCUMENT_KINDS) ?? anchorProblem(value['anchor'], `${path}.anchor`);
}

function sharedFieldsProblem(value: UnknownObject, path: string, idPrefix: string): Problem {
  if (!idIsWellFormed(value['id'], idPrefix)) return {
    code: 'not-a-numbered-id', field: `${path}.id`, storedJson: storedJsonOf(value['id']), prefix: idPrefix
  };
  if (!listOfTextIsWellFormed(value['ticketIds'])) return fieldIsNot(`${path}.ticketIds`, 'a-list-of-ticket-ids');
  if (!nullableText(value['jobId'])) return { code: 'field-is-neither-nor-null', field: `${path}.jobId`, expected: 'a-job-id' };
  return typeof value['openedAt'] === 'string' ? null : fieldIsNot(`${path}.openedAt`, 'a-string');
}

function decisionProblem(value: unknown, index: number): Problem {
  const path = `decisions[${index}]`;
  if (!JsonRecordUtil.valueIsAPlainObject(value)) return fieldIsNot(path, 'an-object');
  const { questions } = value;
  return firstProblemOf([
    () => sharedFieldsProblem(value, path, DECISION_ID_PREFIX),
    () => vocabularyProblem(value['kind'], `${path}.kind`, 'decision-kind', DECISION_KINDS),
    () => vocabularyProblem(value['askedBy'], `${path}.askedBy`, 'decision-asker', DECISION_ASKERS),
    () => (nullableText(value['requestId']) ? null : { code: 'field-is-neither-nor-null', field: `${path}.requestId`, expected: 'a-request-id' }),
    () => (typeof value['context'] === 'string' ? null : fieldIsNot(`${path}.context`, 'a-string')),
    () => (Array.isArray(questions) ? null : fieldIsNot(`${path}.questions`, 'a-list')),
    ...(Array.isArray(questions) ? questions.map((question, questionIndex) => () => questionProblem(question, `${path}.questions[${questionIndex}]`)) : []),
    () => documentQuestionProblem(value, path),
  ]);
}

function deliveryTurnProblem(value: unknown, path: string): Problem {
  if (value === null) return null;
  if (!JsonRecordUtil.valueIsAPlainObject(value)) return { code: 'field-is-neither-null-nor-an-object', field: path };
  if (typeof value['jobId'] !== 'string') return fieldIsNot(`${path}.jobId`, 'a-string');
  return StoredValueUtil.wholeNumberIsAtLeast(value['chatSequence'], FIRST_CHAT_SEQUENCE) ? null : notAtLeast(`${path}.chatSequence`, FIRST_CHAT_SEQUENCE);
}

function incidentProblem(value: unknown, index: number): Problem {
  const path = `incidents[${index}]`;
  if (!JsonRecordUtil.valueIsAPlainObject(value)) return fieldIsNot(path, 'an-object');
  const { facts } = value;
  return firstProblemOf([
    () => sharedFieldsProblem(value, path, INCIDENT_ID_PREFIX),
    () => vocabularyProblem(value['kind'], `${path}.kind`, 'incident-kind', INCIDENT_KINDS),
    () => (JsonRecordUtil.valueIsAPlainObject(facts) && Object.values(facts).every((fact) => typeof fact === 'string') ? null : fieldIsNot(`${path}.facts`, 'an-object-of-text')),
    () => vocabularyProblem(value['defaultMove'], `${path}.defaultMove`, 'incident-move', INCIDENT_MOVES),
    () => deliveryTurnProblem(value['deliveredInTurn'], `${path}.deliveredInTurn`),
  ]);
}

function counterProblem(value: unknown, key: string, firstNumber: number): Problem {
  if (value === undefined || StoredValueUtil.wholeNumberIsAtLeast(value, firstNumber)) return null;
  return {
    code: 'present-counter-below-first', field: key, storedJson: storedJsonOf(value), least: firstNumber
  };
}

function listProblem(value: unknown, key: string, itemProblem: (item: unknown, index: number) => Problem): Problem {
  if (value === undefined) return null;
  if (!Array.isArray(value)) return { code: 'present-field-is-not', field: key, expected: 'an-array' };
  return firstProblemOf(value.map((item, index) => () => itemProblem(item, index)));
}

/** `null` when all four are absent or well formed; the decisions' counter and list come first, then the incidents'. */
function decisionsAndIncidentsProblemOf(document: UnknownObject): Problem {
  return firstProblemOf([
    () => counterProblem(document['nextDecisionId'], 'nextDecisionId', FIRST_DECISION_NUMBER),
    () => listProblem(document['decisions'], 'decisions', decisionProblem),
    () => counterProblem(document['nextIncidentId'], 'nextIncidentId', FIRST_INCIDENT_NUMBER),
    () => listProblem(document['incidents'], 'incidents', incidentProblem),
  ]);
}

export const StoredDecisionAndIncidentValidationUtil = { decisionProblem, incidentProblem, decisionsAndIncidentsProblemOf } as const;
