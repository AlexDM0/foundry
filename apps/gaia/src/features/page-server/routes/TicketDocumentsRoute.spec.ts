/**
 * A ticket's documents answered to the page, from hand-built reads until a recorded forge serves them. What matters: documents read are
 * answered as the page's contract at its version and never cached; a forge's refusal, a ticket with no documents among them, keeps the
 * forge's code, fields and sentence byte for byte under a conflict status, even a sentence that names a command; a refusal of Gaia's is
 * answered in Gaia's words under its own status; and the reader is asked for the forge and ticket the route names. The session guard on
 * the route is `PageServer.spec.ts`'s to hold.
 */
import { describe, expect, test } from 'bun:test';

import type { GaiaTicketDocumentsDocument }                   from '../../../../page/@types/board/TicketDocumentsDocument.ts';
import { TicketDocumentsDocumentMapUtil }                     from '../../../adapters/page-api/TicketDocumentsDocumentMapUtil.ts';
import { EXAMPLE_TICKET_DOCUMENTS }                           from '../../../adapters/page-api/testing/ExampleTicketDocuments.ts';
import { ticketDocumentsAnswerFor, type TicketDocumentsRead } from './TicketDocumentsRoute.ts';

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
    expect([unreachable.status, await unreachable.json()]).toEqual([502, { refusal: 'forge-unreachable', refusedBy: 'gaia' }]);
    const unregistered = await ticketDocumentsAnswerFor('example-absent', '004', readerAnswering({ verdict: 'refused-by-gaia', refusal: 'forge-not-registered' }));
    expect(unregistered.status).toBe(404);
  });
});
