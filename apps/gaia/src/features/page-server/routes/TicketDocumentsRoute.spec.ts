/**
 * A ticket's documents answered to the page, read through the forge client from the recorded forge (`hephaestus-fetch-ticket-documents`)
 * and from hand-built reads. What matters: documents read are answered as the page's contract at its version and never cached; a forge's
 * refusal, a ticket with no documents among them, keeps the forge's code, fields and sentence byte for byte under a conflict status, even a
 * sentence that names a command; a refusal of Gaia's is answered with its code and Gaia's sentence under its own status, a forge that does
 * not answer and a body that does not ingest among them, the latter logged with its keys; the reader is asked for the forge and ticket the
 * route names; and no answer carries the token. The session guard on the route is `PageServer.spec.ts`'s to hold.
 */
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  test
} from 'bun:test';

import type { GaiaTicketDocumentsDocument }                     from '../../../../page/@types/board/TicketDocumentsDocument.ts';
import { TicketDocumentsIngestion }                             from '../../../adapters/forge-api/TicketDocumentsIngestion.ts';
import { RECORDED_TICKET_IDS, recordedTicketDocumentsAnswerOf } from '../../../adapters/forge-api/testing/TicketDocumentsRecordings.ts';
import { TicketDocumentsDocumentMapUtil }                       from '../../../adapters/page-api/TicketDocumentsDocumentMapUtil.ts';
import { EXAMPLE_TICKET_DOCUMENTS }                             from '../../../adapters/page-api/testing/ExampleTicketDocuments.ts';
import {
  recordedHephaestusFetch,
  recordedTicketDocumentsAnswersOf,
  type RecordedHephaestusAnswer,
  type TicketDocumentsSituation,
} from '../../../testing/RecordedAnswers.ts';
import { createScratchDirectory, removeScratchPath } from '../../../testing/ScratchRoot.ts';
import type { BoardRelayLogEntry }                   from '../@types/BoardRelayLogEntry.ts';
import {
  EXAMPLE_FORGE_TOKEN,
  STOREFRONT_TRACKER_ID,
  exampleRelayForgeOf,
  exampleTokenFileIn,
  relaySourcesOver,
  stoppedForgeAnswering,
} from '../testing/ExampleRelayForge.ts';
import {
  ticketDocumentsAnswerFor,
  ticketDocumentsReaderOf,
  type TicketDocumentsRead,
  type TicketDocumentsReader,
} from './TicketDocumentsRoute.ts';

const NO_DOCUMENTS_SENTENCE = 'Ticket 007 has no documents. Run `forge pipeline` to see how this board writes tickets.';

function readerAnswering(read: TicketDocumentsRead, askedFor: string[] = []) {
  return (trackerId: string, ticketId: string): Promise<TicketDocumentsRead> => {
    askedFor.push(`${trackerId} ${ticketId}`);
    return Promise.resolve(read);
  };
}

describe('ticketDocumentsAnswerFor', () => {
  test('answers the documents read as the page\'s contract, never cached, after asking for the forge and ticket named', async () => {
    const askedFor: string[] = [];
    const answer = await ticketDocumentsAnswerFor('example-storefront-7c41', '004', readerAnswering({ verdict: 'read', ticketDocuments: EXAMPLE_TICKET_DOCUMENTS }, askedFor));
    expect([answer.status, answer.headers.get('content-type'), answer.headers.get('cache-control')]).toEqual([200, 'application/json;charset=utf-8', 'no-store']);
    expect((await answer.json()) as GaiaTicketDocumentsDocument).toEqual(TicketDocumentsDocumentMapUtil.ticketDocumentsDocumentOf(EXAMPLE_TICKET_DOCUMENTS));
    expect(askedFor).toEqual(['example-storefront-7c41 004']);
  });

  test('answers a forge\'s refusal with its code, fields and sentence unchanged, even one that names a command', async () => {
    const refusal = { code: 'ticket-has-no-documents', fields: { ticketReference: '007' }, sentence: NO_DOCUMENTS_SENTENCE };
    const answer = await ticketDocumentsAnswerFor('example-storefront-7c41', '007', readerAnswering({ verdict: 'refused-by-forge', refusal }));
    expect([answer.status, answer.headers.get('cache-control')]).toEqual([409, 'no-store']);
    expect(await answer.json()).toEqual({
      refusedBy: 'forge', code: 'ticket-has-no-documents', fields: { ticketReference: '007' }, text: NO_DOCUMENTS_SENTENCE,
    });
  });

  test('answers a refusal of Gaia\'s under its own status', async () => {
    const unreachable = await ticketDocumentsAnswerFor('example-storefront-7c41', '004', readerAnswering({ verdict: 'refused-by-gaia', refusal: 'forge-unreachable' }));
    expect([unreachable.status, await unreachable.json()]).toEqual([502, { refusedBy: 'gaia', code: 'forge-unreachable', text: 'This forge does not answer.' }]);
    const unregistered = await ticketDocumentsAnswerFor('example-absent', '004', readerAnswering({ verdict: 'refused-by-gaia', refusal: 'forge-not-registered' }));
    expect(unregistered.status).toBe(404);
  });
});

let scratchFolder = '';
let tokenPath = '';
const loggedEntries: BoardRelayLogEntry[] = [];

beforeEach(() => {
  scratchFolder = createScratchDirectory('ticket-documents-route');
  tokenPath     = exampleTokenFileIn(scratchFolder);
  loggedEntries.splice(0);
});

afterEach(() => {
  removeScratchPath(scratchFolder);
});

const DOCUMENTS_CALL_SHAPE = /^GET \/api\/v1\/tickets\/[^/]+\/documents with bearer$/;

function documentsAnswersOf(situation: TicketDocumentsSituation): readonly RecordedHephaestusAnswer[] {
  return recordedTicketDocumentsAnswersOf(situation).filter(({ callShape }) => DOCUMENTS_CALL_SHAPE.test(callShape));
}

function recordedReaderOf(answers: readonly RecordedHephaestusAnswer[]): TicketDocumentsReader {
  const sources = relaySourcesOver(exampleRelayForgeOf(scratchFolder, tokenPath), recordedHephaestusFetch(answers));
  return ticketDocumentsReaderOf(sources, (entry) => loggedEntries.push(entry));
}

describe('ticketDocumentsAnswerFor, over the recorded forge', () => {
  test('answers the recorded documents as the page reads them, with no token in the answer', async () => {
    const answer = await ticketDocumentsAnswerFor(STOREFRONT_TRACKER_ID, RECORDED_TICKET_IDS.withDocuments, recordedReaderOf(documentsAnswersOf('ticket-documents-saved')));
    const { status, body } = await recordedTicketDocumentsAnswerOf('ticket-documents-saved');
    const reading = new TicketDocumentsIngestion().ticketDocumentsOf(status, body);
    if (reading.verdict !== 'read') throw new Error('the recorded documents do not ingest');
    const answerText = await answer.text();
    expect([answer.status, JSON.parse(answerText)]).toEqual([200, TicketDocumentsDocumentMapUtil.ticketDocumentsDocumentOf(reading.ticketDocuments)]);
    expect(answerText).not.toContain(EXAMPLE_FORGE_TOKEN);
  });

  test('answers the forge\'s refusal of a ticket with no documents with its sentence unchanged', async () => {
    const answer = await ticketDocumentsAnswerFor(STOREFRONT_TRACKER_ID, RECORDED_TICKET_IDS.withoutDocuments, recordedReaderOf(documentsAnswersOf('ticket-documents-absent')));
    const { body } = await recordedTicketDocumentsAnswerOf('ticket-documents-absent');
    expect([answer.status, await answer.json()]).toEqual([409, {
      refusedBy: 'forge', code: 'ticket-has-no-documents', fields: { ticketId: RECORDED_TICKET_IDS.withoutDocuments }, text: (body as { text: string }).text,
    }]);
  });

  test('refuses a forge that does not answer, and a body that does not ingest, which it logs with its keys', async () => {
    const [documentsAnswer] = documentsAnswersOf('ticket-documents-saved');
    if (documentsAnswer === undefined) throw new Error('the recording holds no documents answer');
    const stopped = await ticketDocumentsAnswerFor(STOREFRONT_TRACKER_ID, RECORDED_TICKET_IDS.withDocuments, ticketDocumentsReaderOf(
      relaySourcesOver(exampleRelayForgeOf(scratchFolder, tokenPath), stoppedForgeAnswering([documentsAnswer.callShape])),
      () => undefined,
    ));
    expect([stopped.status, await stopped.json()]).toEqual([502, { refusedBy: 'gaia', code: 'forge-unreachable', text: 'This forge does not answer.' }]);
    const unreadable = { ...documentsAnswer, answer: { ...documentsAnswer.answer, bodyText: JSON.stringify({ ticketId: RECORDED_TICKET_IDS.withDocuments }) } };
    const answer = await ticketDocumentsAnswerFor(STOREFRONT_TRACKER_ID, RECORDED_TICKET_IDS.withDocuments, recordedReaderOf([unreadable]));
    const unreadableRefusal = { refusedBy: 'gaia', code: 'forge-document-unreadable', text: 'This forge answered with something Gaia cannot read.' };
    expect([answer.status, await answer.json()]).toEqual([502, unreadableRefusal]);
    expect(loggedEntries).toEqual([{
      kind: 'ticket-documents-unreadable', trackerId: STOREFRONT_TRACKER_ID, ticketId: RECORDED_TICKET_IDS.withDocuments, invalidKeys: ['documents', 'effectReadings'],
    }]);
  });
});
