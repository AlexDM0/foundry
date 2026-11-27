/**
 * The ticket documents ingestion against the answers a scratch forge at the supported version gave (`hephaestus-fetch-ticket-documents`):
 * the documents read whole with their Markdown as source text; the forge's 404 refusals keep their code, fields and sentence unchanged; a
 * body that breaks the shape, or any other status, maps nothing and names its keys.
 */
import { describe, expect, test } from 'bun:test';

import { forgeEndpointVersionOf }                               from '../../lib/forge-client/ForgeClient.ts';
import { TicketDocumentsIngestion }                             from './TicketDocumentsIngestion.ts';
import { RECORDED_TICKET_IDS, recordedTicketDocumentsAnswerOf } from './testing/TicketDocumentsRecordings.ts';

const INGESTION = new TicketDocumentsIngestion();

async function savedDocumentsBody(): Promise<Record<string, unknown>> {
  return (await recordedTicketDocumentsAnswerOf('ticket-documents-saved')).body as Record<string, unknown>;
}

describe('ticketDocumentsOf', () => {
  test('reads at the endpoint version forge\'s registry serves the supported forge', () => {
    expect(forgeEndpointVersionOf('ticketDocuments')).toBe(1);
  });

  test('reads the recorded documents of the saved draft: a spec at version 1 by the person, with its Markdown as source, and an unwritten plan', async () => {
    const { status, body } = await recordedTicketDocumentsAnswerOf('ticket-documents-saved');
    const reading = INGESTION.ticketDocumentsOf(status, body);
    if (reading.verdict !== 'read') throw new Error(`The recorded documents read as ${reading.verdict}.`);
    const { ticketDocuments } = reading;
    expect(ticketDocuments.ticketId).toBe(RECORDED_TICKET_IDS.withDocuments);
    expect(ticketDocuments.documents.map(({ document, standing }) => [document, standing])).toEqual([['spec', 'drafting'], ['plan', 'unwritten']]);
    const [spec] = ticketDocuments.documents;
    expect(spec).toMatchObject({
      reviewer: 'person', holdsAcceptance: true, editable: true, proposalMode: 'ask-first', head: { number: 1, author: 'person', jobId: null },
    });
    expect(spec?.markdown).toContain('```mermaid\nflowchart LR\n');
    expect(ticketDocuments.effectReadings).toEqual([]);
  });

  test('reads User\'s answer to the spec agent\'s question as a message on the question\'s line that names the decision and no comment', async () => {
    const { status, body } = await recordedTicketDocumentsAnswerOf('ticket-documents-question-answered');
    const reading = INGESTION.ticketDocumentsOf(status, body);
    if (reading.verdict !== 'read') throw new Error(`The answered documents read as ${reading.verdict}.`);
    const [answer] = reading.ticketDocuments.documents[0]?.messages ?? [];
    expect(answer).toMatchObject({
      decisionId: 'E1', commentNumber: null, placement: { from: 3, to: 3 }, from: 'person', state: 'queued'
    });
    expect(answer?.text).toContain('Any part of a name');
    expect(answer?.answer).toEqual({
      question: 'Does a search by author also match a part of the author\'s name?',
      choice:   'Any part of a name',
      note:     'Keep the example search by title as it is.',
    });
  });

  test('keeps a ticket with no documents and an unknown ticket as the forge\'s refusals, code, fields and sentence unchanged', async () => {
    const absent = await recordedTicketDocumentsAnswerOf('ticket-documents-absent');
    expect(INGESTION.ticketDocumentsOf(absent.status, absent.body)).toEqual({
      verdict: 'refused',
      refusal: { code: 'ticket-has-no-documents', fields: { ticketId: RECORDED_TICKET_IDS.withoutDocuments }, sentence: (absent.body as { text: string }).text },
    });
    const unknown = await recordedTicketDocumentsAnswerOf('ticket-documents-unknown-ticket');
    const unknownReading = INGESTION.ticketDocumentsOf(unknown.status, unknown.body);
    expect(unknownReading).toMatchObject({ verdict: 'refused', refusal: { code: 'no-readable-ticket', fields: { reference: RECORDED_TICKET_IDS.unknown } } });
  });

  test('maps nothing of a body that breaks the shape, and names its keys', async () => {
    const body = await savedDocumentsBody();
    const [spec] = body['documents'] as Record<string, unknown>[];
    const broken = { ...body, documents: [{ ...spec, standing: 'example-unknown-standing', markdown: 7 }] };
    expect(INGESTION.ticketDocumentsOf(200, broken)).toEqual({ verdict: 'unreadable', invalidKeys: ['documents[0].standing', 'documents[0].markdown'] });
    expect(INGESTION.ticketDocumentsOf(404, { refusal: 'ticket-has-no-documents' })).toEqual({ verdict: 'unreadable', invalidKeys: ['fields', 'text'] });
  });

  test('reads any other status as unreadable, so a refusal of another route never passes as the documents\' own', async () => {
    expect(INGESTION.ticketDocumentsOf(500, await savedDocumentsBody())).toEqual({ verdict: 'unreadable', invalidKeys: ['status'] });
  });
});
