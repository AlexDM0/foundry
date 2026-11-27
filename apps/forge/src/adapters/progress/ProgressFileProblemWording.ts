import { GATE_PHASES }           from '../../lib/tracker-model/@types/GatePhase.ts';
import { TICKET_DOCUMENT_KINDS } from '../../lib/tracker-model/@types/TicketDocument.ts';
import {
  DECISION_KINDS,
  INCIDENT_KINDS,
  INCIDENT_MOVES,
  NON_AGENT_DECISION_ASKERS
}                                from '../../lib/tracker-model/constants/DecisionAndIncidentVocabulary.ts';
import { HEPHAESTUS_STATES } from '../../lib/tracker-model/constants/HephaestusStates.ts';
import {
  AIRLOCK_PHASES,
  INTERRUPTION_CAUSES,
  JOB_KINDS,
  JOB_NOT_LAUNCHED_CAUSES,
  JOB_OUTCOMES,
  JOB_ROLES,
  JOB_STATES,
  JOB_STOP_MODES
}                                from '../../lib/tracker-model/constants/JobStates.ts';
import { TASK_STATUSES }      from '../../lib/tracker-model/constants/Statuses.ts';
import { TICKET_STAGE_NAMES } from '../../lib/tracker-model/constants/TicketStages.ts';
import type {
  ProgressFieldExpectation,
  ProgressFileProblem,
  ProgressPresentValueExpectation,
  ProgressVocabulary,
  ProgressWholeNumberUnit
}                                from '../../shared/@types/ProgressFileProblem.ts';
import { PRODUCT_NAMES }                from '../../shared/constants/ProductNames.ts';
import { OLDER_FORMAT_ADVICE }          from '../constants/OlderFormatAdvice.ts';
import { StoredFileProblemWordingUtil } from '../utils/StoredFileProblemWordingUtil.ts';
import { COMMENT_VIEWS }                from './constants/StoredQuestionAnchor.ts';

const EXPECTATION_WORDS: Readonly<Record<ProgressFieldExpectation, string>> = {
  'a-string':                             'a string',
  'a-timestamp':                          'a timestamp',
  'an-object':                            'an object',
  'an-array':                             'an array',
  'a-list':                               'a list',
  'a-whole-number':                       'a whole number',
  'true-or-false':                        'true or false',
  'a-stored-range-shape':                 'one of the stored range shapes',
  'a-list-of-ticket-ids':                 'a list of ticket ids',
  'a-list-of-request-ids':                'a list of request ids',
  'a-list-of-text':                       'a list of text',
  'a-list-of-ticket-id-lists':            'a list of ticket id lists',
  'a-list-of-answers':                    'a list of answers',
  'a-list-of-pictures':                   'a list of at least one picture, each a pictureId of 64 hex digits and a name',
  'an-object-of-text':                    'an object of text',
  'a-key-of-a-question-anchor':           'a key of a question\'s anchor',
  'a-whole-number-of-at-least-its-from':  'a whole number of at least its from',
  'a-ticket-id':                          'a ticket id',
  'a-job-id':                             'a job id',
  'a-request-id':                         'a request id',
  'a-branch':                             'a branch',
  'a-path':                               'a path',
  'a-whole-number-of-tokens':             'a whole number of tokens',
  'an-entity-key':                        'an entity key',
  'the-key-of-the-claim-that-started-it': 'the key of the claim that started it',
  'the-id-of-the-ticket-it-reviews':      'the id of the ticket it reviews',
  'a-hash':                               'a hash',
  'a-record-of-entity-hashes':            'a record of a hash for each entity key',
  'a-tree':                               'a tree',
  'true':                                 'true',
  'a-gate-phase':                         `one of ${GATE_PHASES.join(', ')}`,
  'a-ticket-stage':                       `a stage name, one of ${TICKET_STAGE_NAMES.join(', ')}, with the key of the entity that runs it`,
  'a-record-of-package-seals':            'a record of a seal for each package entity key',
  'a-list-of-task-phases':                `a list of phases, each a known status with the timestamp it was reached at; ${OLDER_FORMAT_ADVICE}`,
};

const PRESENT_VALUE_WORDS: Readonly<Record<ProgressPresentValueExpectation, string>> = {
  'one-of-the-hephaestus-states': `one of ${HEPHAESTUS_STATES.join(', ')}`,
  'a-timestamp':                  'a timestamp',
  'a-branch-namespace':           'lower-case letters, digits and inner dashes',
};

const VOCABULARY_WORDS: Readonly<Record<ProgressVocabulary, readonly string[]>> = {
  'task-status':            TASK_STATUSES,
  'job-kind':               JOB_KINDS,
  'job-state':              JOB_STATES,
  'interruption-cause':     INTERRUPTION_CAUSES,
  'airlock-phase':          AIRLOCK_PHASES,
  'job-stop-mode':          JOB_STOP_MODES,
  'job-not-launched-cause': JOB_NOT_LAUNCHED_CAUSES,
  'job-outcome':            JOB_OUTCOMES,
  'decision-kind':          DECISION_KINDS,
  'decision-asker':         [...JOB_ROLES, ...NON_AGENT_DECISION_ASKERS],
  'ticket-document-kind':   TICKET_DOCUMENT_KINDS,
  'comment-view':           COMMENT_VIEWS,
  'incident-kind':          INCIDENT_KINDS,
  'incident-move':          INCIDENT_MOVES,
};

/** A kind or status an earlier release wrote is a row only that release reads, so its sentence says how to read it. */
const VOCABULARIES_AN_EARLIER_RELEASE_WROTE: readonly ProgressVocabulary[] = ['task-status', 'job-kind'];

const UNIT_WORDS: Readonly<Record<ProgressWholeNumberUnit, string>> = { 'whole-number': 'a whole number', 'whole-round': 'a whole round' };

function vocabularySentenceOf(field: string, storedJson: string, vocabulary: ProgressVocabulary): string {
  const sentence = `${field} is ${storedJson}, which is not one of ${VOCABULARY_WORDS[vocabulary].join(', ')}`;
  return VOCABULARIES_AN_EARLIER_RELEASE_WROTE.includes(vocabulary) ? `${sentence}; ${OLDER_FORMAT_ADVICE}` : sentence;
}

function sentenceOf(problem: ProgressFileProblem): string {
  switch (problem.code) {
    case 'document-not-a-json-object':
      return 'the document is not a JSON object';
    case 'version-not-read':
      return `${problem.field} is ${problem.storedJson}, and this build of ${PRODUCT_NAMES.PROGRAM} reads version ${problem.readVersion}; ${OLDER_FORMAT_ADVICE}`;
    case 'field-is-not':
      return `${problem.field} is not ${EXPECTATION_WORDS[problem.expected]}`;
    case 'field-is-neither-nor-null':
      return `${problem.field} is neither ${EXPECTATION_WORDS[problem.expected]} nor null`;
    case 'field-is-neither-null-nor-an-object':
      return `${problem.field} is neither null nor an object`;
    case 'present-field-is-not':
      return `${problem.field} is present but not ${EXPECTATION_WORDS[problem.expected]}`;
    case 'present-field-is-not-at-least':
      return `${problem.field} is present but not ${UNIT_WORDS[problem.unit]} of at least ${problem.least}`;
    case 'field-is-not-at-least':
      return `${problem.field} is not a whole number of at least ${problem.least}`;
    case 'present-and-field-is-not':
      return `${problem.field} is present and is not ${EXPECTATION_WORDS[problem.expected]}`;
    case 'present-and-field-is-not-at-least':
      return `${problem.field} is present and is not ${UNIT_WORDS[problem.unit]} of at least ${problem.least}`;
    case 'counter-below-first':
      return `${problem.field} is ${problem.storedJson}, and it has to be a whole number of at least ${problem.least}`;
    case 'present-counter-below-first':
      return `${problem.field} is ${problem.storedJson}, and when present it has to be a whole number of at least ${problem.least}`;
    case 'present-value-is-not':
      return `${problem.field} is ${problem.storedJson}, and when present it has to be ${PRESENT_VALUE_WORDS[problem.expected]}`;
    case 'not-in-vocabulary':
      return vocabularySentenceOf(problem.field, problem.storedJson, problem.vocabulary);
    case 'neither-null-nor-a-job-role':
      return `${problem.field} is ${problem.storedJson}, which is neither null nor one of ${JOB_ROLES.join(', ')}; ${OLDER_FORMAT_ADVICE}`;
    case 'not-a-numbered-id':
      return `${problem.field} is ${problem.storedJson}, and it has to be ${problem.prefix} and a whole number`;
    case 'retired-pipeline-key':
      return `${problem.field} is present, and the gate pipeline lives in pipeline.json; ${OLDER_FORMAT_ADVICE}`;
    case 'retired-row-check-command':
      return `${problem.field} is present, and a row records the hash of the pipeline it was gated by instead; ${OLDER_FORMAT_ADVICE}`;
    case 'log-kept-in-document':
      return `${problem.field} is present, and a version ${problem.documentVersion} file keeps its log in log.jsonl`;
    case 'malformed-option-note':
      return `${problem.field} is not a well-formed option note (${problem.noteField}: ${problem.noteProblem})`;
    case 'malformed-option-facts':
      return `${problem.field} holds a touches, tradeOff or acceptanceEffect that is not well formed`;
    case 'document-without-anchor':
      return `${problem.field} names a document without an anchor, or an anchor without a document`;
    default:
      return StoredFileProblemWordingUtil.sentenceOf(problem);
  }
}

export const ProgressFileProblemWording = Object.freeze({ sentenceOf });
