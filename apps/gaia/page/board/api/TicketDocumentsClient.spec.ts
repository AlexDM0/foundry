/**
 * The ticket documents' read client. What matters: it reads the relay's documents route at its version with the session cookie and no
 * `Authorization` header; documents of this page's version are read and another version is `unreadable`; a forge's refusal reads as its
 * own sentence and Gaia's as Gaia's sentence, never as its code; a 401 is `no-session` and nothing answering `unreachable`.
 */
import { describe, expect, test } from 'bun:test';

import { GAIA_ENDPOINT_VERSIONS }       from '../../../src/shared/constants/GaiaSystemVersions.ts';
import { fakeRelayRequests, headersOf } from '../testing/FakeRelay.ts';
import { TicketDocumentsClient }        from './TicketDocumentsClient.ts';

describe('the ticket documents\' read client', () => {
  test('reads the relay\'s documents route with the session cookie and no Authorization header, and documents of this version are read', async () => {
    const relay = fakeRelayRequests();
    const documents = {
      ticketDocumentsVersion: 1, ticketId: '004', documents: [], effectReadings: []
    };
    relay.answerWith(Response.json(documents));
    const read = await TicketDocumentsClient.create('example-tracker', relay.sendRequest).read('004');
    const [request] = relay.sent;
    expect(request?.path).toBe(`/api/v${GAIA_ENDPOINT_VERSIONS.forgeTicketDocuments}/forges/example-tracker/tickets/004/documents`);
    expect([request?.requestOptions.method, request?.requestOptions.credentials, headersOf(request).has('authorization')]).toEqual(['GET', 'same-origin', false]);
    expect(read).toEqual({ verdict: 'read', documents } as unknown as typeof read);
  });

  test('documents of another version are unreadable', async () => {
    const relay = fakeRelayRequests();
    relay.answerWith(Response.json({ ticketDocumentsVersion: 2, ticketId: '004' }));
    expect(await TicketDocumentsClient.create('example-tracker', relay.sendRequest).read('004')).toEqual({ verdict: 'unreadable' });
  });

  test('a forge\'s refusal reads as its own sentence, bare or under refusal, Gaia\'s as Gaia\'s sentence, and a bare code as unreadable', async () => {
    const relay = fakeRelayRequests();
    const client = TicketDocumentsClient.create('example-tracker', relay.sendRequest);
    const forgeRefusal = {
      refusedBy: 'forge', code: 'ticket-has-no-documents', fields: {}, text: 'Ticket 004 has no spec or plan.'
    };
    relay.answerWith(Response.json(forgeRefusal, { status: 409 }));
    relay.answerWith(Response.json({ refusal: forgeRefusal }, { status: 409 }));
    relay.answerWith(Response.json({ refusedBy: 'gaia', code: 'forge-unreachable', text: 'This forge does not answer.' }, { status: 502 }));
    relay.answerWith(Response.json({ refusal: 'forge-unreachable', refusedBy: 'gaia' }, { status: 502 }));
    expect([await client.read('004'), await client.read('004'), await client.read('004'), await client.read('004')]).toEqual([
      { verdict: 'refused', refusal: 'Ticket 004 has no spec or plan.' },
      { verdict: 'refused', refusal: 'Ticket 004 has no spec or plan.' },
      { verdict: 'refused', refusal: 'This forge does not answer.' },
      { verdict: 'unreadable' },
    ]);
  });

  test('a 401 is no-session, and nothing answering is unreachable', async () => {
    const relay = fakeRelayRequests();
    const client = TicketDocumentsClient.create('example-tracker', relay.sendRequest);
    relay.answerWith(new Response(null, { status: 401 }));
    expect([await client.read('004'), await client.read('004')]).toEqual([{ verdict: 'no-session' }, { verdict: 'unreachable' }]);
  });
});
