/**
 * The session routes over session codes on a clock set by hand: a code is answered in a JSON body no cache keeps, spent once for an
 * `HttpOnly`, `SameSite=Strict` cookie whose name carries the port, and a body that holds no code as a string is not understood.
 */
import { describe, expect, test } from 'bun:test';

import { createSessionCodes, type SessionCodes }                               from '../../../lib/local-http-guards/SessionCodes.ts';
import { sessionCodeAnswerOf, sessionCookieNameFor, sessionExchangeAnswerFor } from './SessionRoutes.ts';

const EXAMPLE_PORT = 4790;

function sessionCodesOnAStoppedClock(): SessionCodes {
  return createSessionCodes({ cookieName: sessionCookieNameFor(EXAMPLE_PORT), now: () => 0 });
}

function exchangeRequestOf(body: string): Request {
  return new Request(`http://127.0.0.1:${EXAMPLE_PORT}/api/session`, { method: 'POST', body });
}

async function issuedCodeOf(sessionCodes: SessionCodes): Promise<string> {
  const { code } = await sessionCodeAnswerOf(sessionCodes).json() as { readonly code: string };
  return code;
}

describe('the session cookie\'s name', () => {
  test('carries the port, since a cookie on 127.0.0.1 reaches every port of it', () => {
    expect(sessionCookieNameFor(EXAMPLE_PORT)).toBe('gaia-session-4790');
  });
});

describe('a session code', () => {
  test('is answered in a JSON body that no cache keeps', async () => {
    const answer = sessionCodeAnswerOf(sessionCodesOnAStoppedClock());
    expect([answer.status, answer.headers.get('cache-control')]).toEqual([200, 'no-store']);
    expect(await answer.json()).toEqual({ code: expect.stringMatching(/^[0-9a-f]{64}$/) });
  });

  test('is spent once for the session cookie, and refused the second time', async () => {
    const sessionCodes = sessionCodesOnAStoppedClock();
    const code = await issuedCodeOf(sessionCodes);

    const exchanged = await sessionExchangeAnswerFor(exchangeRequestOf(JSON.stringify({ code })), sessionCodes);
    expect([exchanged.status, exchanged.headers.get('cache-control')]).toEqual([204, 'no-store']);
    const cookieAttributes = (exchanged.headers.get('set-cookie') ?? '').split('; ');
    expect(cookieAttributes[0]).toMatch(/^gaia-session-4790=[0-9a-f]{64}$/);
    expect(cookieAttributes).toContain('HttpOnly');
    expect(cookieAttributes).toContain('SameSite=Strict');

    const spent = await sessionExchangeAnswerFor(exchangeRequestOf(JSON.stringify({ code })), sessionCodes);
    expect([spent.status, spent.headers.get('set-cookie')]).toEqual([401, null]);
  });

  test('is not understood from a body that is no JSON, no object, or holds no code as a string', async () => {
    const sessionCodes = sessionCodesOnAStoppedClock();
    const bodies = ['code', 'null', '["code"]', '{}', '{"code": 4790}'];
    const statuses = await Promise.all(bodies.map(async (body) => (await sessionExchangeAnswerFor(exchangeRequestOf(body), sessionCodes)).status));
    expect(statuses).toEqual([400, 400, 400, 400, 400]);
  });
});
