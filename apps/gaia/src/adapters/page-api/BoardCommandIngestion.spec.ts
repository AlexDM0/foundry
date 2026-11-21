/**
 * The page's board command body read into Gaia's model. What matters: a valid body of each kind becomes its model command, every typed draft
 * edit included; a key the kind does not name never reaches the model; a missing key, a key of the wrong type, a value outside its union and
 * a malformed draft edit are refused as a malformed body and named; a kind Gaia does not send, a by-hand kind among them, is refused as
 * unknown; a body at another version or no JSON object is malformed.
 */
import { describe, expect, test } from 'bun:test';

import { PAGE_CONTRACT_VERSIONS }                                 from '../../shared/constants/PageContractVersions.ts';
import { BoardCommandIngestion }                                  from './BoardCommandIngestion.ts';
import { EXAMPLE_BOARD_COMMAND_DOCUMENTS, exampleBoardCommandOf } from './testing/ExampleBoardCommandDocuments.ts';

const INGESTION = new BoardCommandIngestion();

function readingOf(body: unknown) {
  return INGESTION.commandOf(JSON.stringify(body));
}

describe('commandOf, on a valid body', () => {
  test.each(Object.values(EXAMPLE_BOARD_COMMAND_DOCUMENTS))('reads $kind into its model command', (document) => {
    expect(readingOf(document)).toEqual({ verdict: 'readable', command: exampleBoardCommandOf(document) });
  });

  test('reads each form of a resume\'s target', () => {
    const resume = EXAMPLE_BOARD_COMMAND_DOCUMENTS['interrupted-work-resume'];
    expect(readingOf({ ...resume, target: 'all' })).toEqual({ verdict: 'readable', command: { kind: 'interrupted-work-resume', target: 'all' } });
    expect(readingOf({ ...resume, target: { jobId: 'J1' } })).toEqual({ verdict: 'readable', command: { kind: 'interrupted-work-resume', target: { jobId: 'J1' } } });
  });

  test('passes over a key the kind does not name, at the top and inside a draft edit', () => {
    const hold = EXAMPLE_BOARD_COMMAND_DOCUMENTS['ticket-hold'];
    expect(readingOf({ ...hold, exampleExtraKey: true })).toEqual({ verdict: 'readable', command: exampleBoardCommandOf(hold) });
    const edit = EXAMPLE_BOARD_COMMAND_DOCUMENTS['pipeline-draft-edit'];
    const editsWithExtraKeys = edit.edits.map((draftEdit) => ({ ...draftEdit, exampleExtraKey: 1 }));
    expect(readingOf({ ...edit, edits: editsWithExtraKeys })).toEqual({ verdict: 'readable', command: exampleBoardCommandOf(edit) });
  });
});

describe('commandOf, on a body it refuses', () => {
  test('names a missing key', () => {
    const { reason: _reason, ...holdWithoutReason } = EXAMPLE_BOARD_COMMAND_DOCUMENTS['ticket-hold'];
    expect(readingOf(holdWithoutReason)).toEqual({ verdict: 'refused', refusal: 'malformed-body', invalidKeys: ['reason'] });
  });

  test('names a key of the wrong type and a value outside its union', () => {
    expect(readingOf({ ...EXAMPLE_BOARD_COMMAND_DOCUMENTS['concurrency-set'], limit: '3' })).toEqual({ verdict: 'refused', refusal: 'malformed-body', invalidKeys: ['limit'] });
    expect(readingOf({ ...EXAMPLE_BOARD_COMMAND_DOCUMENTS['job-stop'], mode: 'fresh' })).toEqual({ verdict: 'refused', refusal: 'malformed-body', invalidKeys: ['mode'] });
  });

  test('names a draft edit no typed edit fits, and an entity role a forge-level role', () => {
    const edit = EXAMPLE_BOARD_COMMAND_DOCUMENTS['pipeline-draft-edit'];
    const gateWithoutItsRun = { target: 'gate', name: 'unit', value: { name: 'unit' } };
    expect(readingOf({ ...edit, edits: [gateWithoutItsRun] })).toEqual({ verdict: 'refused', refusal: 'malformed-body', invalidKeys: ['edits[0]'] });
    const forgeLevelRoleInEntity = { target: 'within-entity', entityKey: 'web', edit: { target: 'role', role: 'assistant', value: null } };
    expect(readingOf({ ...edit, edits: [forgeLevelRoleInEntity] })).toEqual({ verdict: 'refused', refusal: 'malformed-body', invalidKeys: ['edits[0]'] });
  });

  test('names a resume target that is neither all, a job nor a ticket', () => {
    const resume = EXAMPLE_BOARD_COMMAND_DOCUMENTS['interrupted-work-resume'];
    expect(readingOf({ ...resume, target: 'network-outage' })).toEqual({ verdict: 'refused', refusal: 'malformed-body', invalidKeys: ['target'] });
    expect(readingOf({ ...resume, target: { jobId: 7 } })).toEqual({ verdict: 'refused', refusal: 'malformed-body', invalidKeys: ['target'] });
  });

  test('refuses a kind Gaia does not send, a by-hand kind among them, and a body naming no kind', () => {
    const version = { boardCommandVersion: PAGE_CONTRACT_VERSIONS.gaiaBoardCommand };
    expect(readingOf({ ...version, kind: 'ticket-unready', ticketId: '001' })).toEqual({ verdict: 'refused', refusal: 'unknown-kind', kind: 'ticket-unready' });
    expect(readingOf({ ...version, kind: 'job-stop-all', mode: 'stop' })).toEqual({ verdict: 'refused', refusal: 'unknown-kind', kind: 'job-stop-all' });
    expect(readingOf(version)).toEqual({ verdict: 'refused', refusal: 'unknown-kind', kind: null });
  });

  test('refuses a body at another version, or with none, as malformed', () => {
    const hold = EXAMPLE_BOARD_COMMAND_DOCUMENTS['ticket-hold'];
    const newerVersion = PAGE_CONTRACT_VERSIONS.gaiaBoardCommand + 1;
    expect(readingOf({ ...hold, boardCommandVersion: newerVersion })).toEqual({ verdict: 'refused', refusal: 'malformed-body', invalidKeys: ['boardCommandVersion'] });
    const { boardCommandVersion: _version, ...holdWithoutVersion } = hold;
    expect(readingOf(holdWithoutVersion)).toEqual({ verdict: 'refused', refusal: 'malformed-body', invalidKeys: ['boardCommandVersion'] });
  });

  test('refuses text that is no JSON object as malformed', () => {
    expect(INGESTION.commandOf('not json')).toEqual({ verdict: 'refused', refusal: 'malformed-body', invalidKeys: [] });
    expect(INGESTION.commandOf('[]')).toEqual({ verdict: 'refused', refusal: 'malformed-body', invalidKeys: [] });
  });
});
