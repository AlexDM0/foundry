/**
 * A stored decision or incident the format does not hold makes the whole progress file unreadable, so each field's check is planted once
 * and its reason must name the field; well-formed ones, and a file with none of the four keys, pass.
 */
import { expect, test } from 'bun:test';

import { sentenceOfProblem }                       from '../testing/WordedProgressProblem.ts';
import { StoredDecisionAndIncidentValidationUtil } from './StoredDecisionAndIncidentValidationUtil.ts';

const decisionProblem = (value: unknown, index: number): string | null => sentenceOfProblem(StoredDecisionAndIncidentValidationUtil.decisionProblem(value, index));

const incidentProblem = (value: unknown, index: number): string | null => sentenceOfProblem(StoredDecisionAndIncidentValidationUtil.incidentProblem(value, index));

const decisionsAndIncidentsProblemOf = (document: Record<string, unknown>): string | null =>
  sentenceOfProblem(StoredDecisionAndIncidentValidationUtil.decisionsAndIncidentsProblemOf(document));

const WELL_FORMED_QUESTION = {
  question:    'Which export format?',
  header:      'Format',
  multiSelect: false,
  options:     [{ label: 'CSV', description: 'Comma separated', isRecommended: true }],
};

const WELL_FORMED_DECISION = {
  id:        'E1',
  kind:      'agent-question',
  ticketIds: ['001'],
  jobId:     'J1',
  askedBy:   'builder',
  requestId: 'request-1',
  questions: [WELL_FORMED_QUESTION],
  context:   'Example export',
  openedAt:  '2026-09-26T10:15:00+02:00',
};

const QUESTION_ANCHOR = {
  view: 'code', versionNumber: 2, lines: { from: 6, to: 6 }, sectionPath: ['Behaviour'], surroundingLines: { from: 4, to: 8 }
};

const DOCUMENT_QUESTION = {
  ...WELL_FORMED_DECISION, askedBy: 'spec-agent', requestId: null, document: 'spec', anchor: QUESTION_ANCHOR
};

const WELL_FORMED_INCIDENT = {
  id:              'I1',
  kind:            'blocked',
  ticketIds:       ['001'],
  jobId:           null,
  facts:           { reason: 'Example reason' },
  defaultMove:     'ticket-park',
  deliveredInTurn: null,
  openedAt:        '2026-09-26T10:15:00+02:00',
};

test('a well-formed decision and incident have no problem, a code-opened decision and a delivered incident included', () => {
  expect(decisionProblem(WELL_FORMED_DECISION, 0)).toBeNull();
  expect(decisionProblem({
    ...WELL_FORMED_DECISION,
    questions: [{
      ...WELL_FORMED_QUESTION,
      options: [{
        label: 'CSV', description: 'Comma separated', isRecommended: false, touches: ['src/export/Csv.ts'], tradeOff: 'Plain.', acceptanceEffect: 'A2 fails.'
      }],
    }],
  }, 0)).toBeNull();
  expect(decisionProblem({
    ...WELL_FORMED_DECISION, kind: 'outage', jobId: null, askedBy: 'hephaestus', requestId: null,
  }, 0)).toBeNull();
  expect(decisionProblem(DOCUMENT_QUESTION, 0)).toBeNull();
  expect(incidentProblem(WELL_FORMED_INCIDENT, 0)).toBeNull();
  expect(incidentProblem({ ...WELL_FORMED_INCIDENT, deliveredInTurn: { jobId: 'J4', chatSequence: 1 } }, 0)).toBeNull();
});

test('a file with none of the four keys has no problem', () => {
  expect(decisionsAndIncidentsProblemOf({})).toBeNull();
});

test.each<[string, Record<string, unknown>, string]>([
  ['an id of the wrong form', { id: 'D1' }, 'decisions[0].id is "D1", and it has to be E and a whole number'],
  ['the retired first-run kind', { kind: 'first-run' }, 'decisions[0].kind is "first-run", which is not one of'],
  ['an unknown asker', { askedBy: 'user' }, 'decisions[0].askedBy is "user", which is not one of'],
  ['a request id that is a number', { requestId: 7 }, 'decisions[0].requestId is neither a request id nor null'],
  ['ticket ids that are not a list', { ticketIds: '001' }, 'decisions[0].ticketIds is not a list of ticket ids'],
  ['a job id that is a number', { jobId: 1 }, 'decisions[0].jobId is neither a job id nor null'],
  ['no context', { context: undefined }, 'decisions[0].context is not a string'],
  ['no opening stamp', { openedAt: null }, 'decisions[0].openedAt is not a string'],
  ['questions that are not a list', { questions: {} }, 'decisions[0].questions is not a list'],
  ['a question without a header', { questions: [{ ...WELL_FORMED_QUESTION, header: null }] }, 'decisions[0].questions[0].header is not a string'],
  ['a multiSelect that is text', { questions: [{ ...WELL_FORMED_QUESTION, multiSelect: 'no' }] }, 'decisions[0].questions[0].multiSelect is not true or false'],
  [
    'an option without a description',
    { questions: [{ ...WELL_FORMED_QUESTION, options: [{ label: 'CSV' }] }] },
    'decisions[0].questions[0].options[0].description is not a string',
  ],
  [
    'an option with no recommendation flag',
    { questions: [{ ...WELL_FORMED_QUESTION, options: [{ label: 'CSV', description: 'Comma separated' }] }] },
    'decisions[0].questions[0].options[0].isRecommended is not true or false',
  ],
  [
    'an option whose touches is not a list',
    {
      questions: [{
        ...WELL_FORMED_QUESTION,
        options: [{
          label: 'CSV', description: 'Comma separated', isRecommended: false, touches: 'src/a.ts'
        }]
      }]
    },
    'decisions[0].questions[0].options[0] holds a touches, tradeOff or acceptanceEffect that is not well formed',
  ],
])('a decision with %s is refused naming the field', (_case, change, reason) => {
  expect(decisionsAndIncidentsProblemOf({ decisions: [{ ...WELL_FORMED_DECISION, ...change }] })).toStartWith(reason);
});

test.each<[string, Record<string, unknown>, string]>([
  ['a document without an anchor', { anchor: undefined }, 'decisions[0] names a document without an anchor, or an anchor without a document'],
  ['an anchor without a document', { document: undefined }, 'decisions[0] names a document without an anchor, or an anchor without a document'],
  ['an unknown document', { document: 'ticket' }, 'decisions[0].document is "ticket", which is not one of'],
  ['an anchor with a quote', { anchor: { ...QUESTION_ANCHOR, quote: 'keeps' } }, 'decisions[0].anchor.quote is not a key of a question\'s anchor'],
  ['an anchor on line 0', { anchor: { ...QUESTION_ANCHOR, lines: { from: 0, to: 0 } } }, 'decisions[0].anchor.lines.from is not a whole number of at least 1'],
  ['an anchor with no section path', { anchor: { ...QUESTION_ANCHOR, sectionPath: 'Behaviour' } }, 'decisions[0].anchor.sectionPath is not a list of text'],
])('a document agent\'s question with %s is refused naming the field', (_case, change, reason) => {
  expect(decisionsAndIncidentsProblemOf({ decisions: [{ ...DOCUMENT_QUESTION, ...change }] })).toStartWith(reason);
});

test.each<[string, Record<string, unknown>, string]>([
  ['an id of the wrong form', { id: 'I0' }, 'incidents[0].id is "I0", and it has to be I and a whole number'],
  ['an unknown kind', { kind: 'outage' }, 'incidents[0].kind is "outage", which is not one of'],
  ['facts that are not text', { facts: { exitCode: 1 } }, 'incidents[0].facts is not an object of text'],
  ['an unknown default move', { defaultMove: 'ticket-waive' }, 'incidents[0].defaultMove is "ticket-waive", which is not one of'],
  ['a delivery turn without a job', { deliveredInTurn: { chatSequence: 1 } }, 'incidents[0].deliveredInTurn.jobId is not a string'],
  ['a delivery turn numbered 0', { deliveredInTurn: { jobId: 'J1', chatSequence: 0 } }, 'incidents[0].deliveredInTurn.chatSequence is not a whole number of at least 1'],
  ['a delivery turn that is text', { deliveredInTurn: 'J1' }, 'incidents[0].deliveredInTurn is neither null nor an object'],
])('an incident with %s is refused naming the field', (_case, change, reason) => {
  expect(decisionsAndIncidentsProblemOf({ incidents: [{ ...WELL_FORMED_INCIDENT, ...change }] })).toStartWith(reason);
});

test.each<[Record<string, unknown>, string]>([
  [{ nextDecisionId: 0 }, 'nextDecisionId is 0, and when present it has to be a whole number of at least 1'],
  [{ nextIncidentId: 1.5 }, 'nextIncidentId is 1.5, and when present it has to be a whole number of at least 1'],
  [{ decisions: {} }, 'decisions is present but not an array'],
  [{ incidents: 'I1' }, 'incidents is present but not an array'],
  [{ decisions: [WELL_FORMED_DECISION, null] }, 'decisions[1] is not an object'],
])('%o is refused naming the key', (document, reason) => {
  expect(decisionsAndIncidentsProblemOf(document)).toBe(reason);
});
