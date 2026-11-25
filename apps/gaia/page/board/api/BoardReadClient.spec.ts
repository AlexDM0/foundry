/**
 * The board's read client. What matters: it reads the relay's board route at its version with the session cookie and no `Authorization`
 * header; a board of this page's version is read, one of another version is `unreadable`; a refusal of Gaia's keeps its reason; a 401 is
 * `no-session` and nothing answering `unreachable`.
 */
import { describe, expect, test } from 'bun:test';

import { GAIA_ENDPOINT_VERSIONS }       from '../../../src/shared/constants/GaiaSystemVersions.ts';
import { fakeRelayRequests, headersOf } from '../testing/FakeRelay.ts';
import { BoardReadClient }              from './BoardReadClient.ts';

describe('the board\'s read client', () => {
  test('reads the relay\'s board route with the session cookie and no Authorization header, and a board of this version is read', async () => {
    const relay = fakeRelayRequests();
    const board = { boardVersion: 3, project: 'Example Agency' };
    relay.answerWith(Response.json(board));
    const read = await BoardReadClient.create('example-tracker', relay.sendRequest).read();
    const [request] = relay.sent;
    expect(request?.path).toBe(`/api/v${GAIA_ENDPOINT_VERSIONS.forgeBoard}/forges/example-tracker/board`);
    expect([request?.requestOptions.method, request?.requestOptions.credentials, headersOf(request).has('authorization')]).toEqual(['GET', 'same-origin', false]);
    expect(read).toEqual({ verdict: 'read', board } as unknown as typeof read);
  });

  test('a board of another version is unreadable, and a refusal of Gaia\'s keeps its reason', async () => {
    const relay = fakeRelayRequests();
    const client = BoardReadClient.create('example-tracker', relay.sendRequest);
    relay.answerWith(Response.json({ boardVersion: 4 }));
    relay.answerWith(Response.json({ refusal: 'forge-unreachable', refusedBy: 'gaia' }, { status: 502 }));
    expect([await client.read(), await client.read()]).toEqual([{ verdict: 'unreadable' }, { verdict: 'refused', refusal: 'forge-unreachable' }]);
  });

  test('a 401 is no-session, and nothing answering is unreachable', async () => {
    const relay = fakeRelayRequests();
    const client = BoardReadClient.create('example-tracker', relay.sendRequest);
    relay.answerWith(new Response(null, { status: 401 }));
    expect([await client.read(), await client.read()]).toEqual([{ verdict: 'no-session' }, { verdict: 'unreachable' }]);
  });
});
