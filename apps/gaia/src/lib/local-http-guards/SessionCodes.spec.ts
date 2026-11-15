/**
 * Browser sessions bought with one-time codes. The cases that matter: a code buys one `HttpOnly`, `SameSite=Strict` cookie that then holds
 * a session; a spent code, a code never issued and a code past its life buy nothing; and only a secret this instance issued, under the
 * cookie's own name, holds a session. The clock is injected, so no case waits out the code's life.
 */
import { describe, expect, test } from 'bun:test';

import { createSessionCodes, SESSION_CODE_LIFETIME_MILLISECONDS, type SessionCodes } from './SessionCodes.ts';

const COOKIE_NAME = 'example-session-4790';

interface ClockedSessionCodes {
  readonly sessionCodes: SessionCodes;
  readonly advanceClock: (milliseconds: number) => void;
}

function sessionCodesOnAClock(): ClockedSessionCodes {
  let clockMilliseconds = 0;
  return {
    sessionCodes: createSessionCodes({ cookieName: COOKIE_NAME, now: () => clockMilliseconds }),
    advanceClock: (milliseconds) => {
      clockMilliseconds += milliseconds;
    },
  };
}

function requestWithCookie(cookie: string | null): Request {
  return new Request('http://127.0.0.1:4790/api/fleet', cookie === null ? {} : { headers: { cookie } });
}

/** The `name=secret` pair a browser sends back for a `Set-Cookie` header. */
function cookiePairOf(setCookieHeader: string): string {
  return setCookieHeader.split(';')[0] ?? '';
}

function exchangedSetCookieHeader(sessionCodes: SessionCodes): string {
  const exchange = sessionCodes.exchangeCode(sessionCodes.issueCode());
  expect(exchange.verdict).toBe('exchanged');
  return exchange.verdict === 'exchanged' ? exchange.setCookieHeader : '';
}

describe('a code exchange', () => {
  test('buys an HttpOnly, SameSite=Strict cookie under the cookie\'s own name, for the whole server', () => {
    const { sessionCodes } = sessionCodesOnAClock();
    const attributes = exchangedSetCookieHeader(sessionCodes).split('; ');
    expect(attributes[0]?.startsWith(`${COOKIE_NAME}=`)).toBe(true);
    expect(attributes.slice(1)).toEqual(['Path=/', 'HttpOnly', 'SameSite=Strict']);
  });

  test('issues a fresh code and a fresh secret each time', () => {
    const { sessionCodes } = sessionCodesOnAClock();
    expect(sessionCodes.issueCode()).not.toBe(sessionCodes.issueCode());
    expect(exchangedSetCookieHeader(sessionCodes)).not.toBe(exchangedSetCookieHeader(sessionCodes));
  });

  test('refuses a spent code', () => {
    const { sessionCodes } = sessionCodesOnAClock();
    const code = sessionCodes.issueCode();
    expect(sessionCodes.exchangeCode(code).verdict).toBe('exchanged');
    expect(sessionCodes.exchangeCode(code)).toEqual({ verdict: 'refused' });
  });

  test('refuses a code never issued', () => {
    const { sessionCodes } = sessionCodesOnAClock();
    sessionCodes.issueCode();
    expect(sessionCodes.exchangeCode('f'.repeat(64))).toEqual({ verdict: 'refused' });
  });

  test('refuses a code past its life', () => {
    const { sessionCodes, advanceClock } = sessionCodesOnAClock();
    const code = sessionCodes.issueCode();
    advanceClock(SESSION_CODE_LIFETIME_MILLISECONDS + 1);
    expect(sessionCodes.exchangeCode(code)).toEqual({ verdict: 'refused' });
  });

  test('admits a code at the very end of its life', () => {
    const { sessionCodes, advanceClock } = sessionCodesOnAClock();
    const code = sessionCodes.issueCode();
    advanceClock(SESSION_CODE_LIFETIME_MILLISECONDS);
    expect(sessionCodes.exchangeCode(code).verdict).toBe('exchanged');
  });

  test('refuses a code past its life that a later issue already forgot', () => {
    const { sessionCodes, advanceClock } = sessionCodesOnAClock();
    const code = sessionCodes.issueCode();
    advanceClock(SESSION_CODE_LIFETIME_MILLISECONDS + 1);
    sessionCodes.issueCode();
    expect(sessionCodes.exchangeCode(code)).toEqual({ verdict: 'refused' });
  });
});

describe('a session', () => {
  test('is held by the cookie a code bought, among other cookies', () => {
    const { sessionCodes } = sessionCodesOnAClock();
    const cookiePair = cookiePairOf(exchangedSetCookieHeader(sessionCodes));
    expect(sessionCodes.requestHoldsSession(requestWithCookie(`theme=dark; ${cookiePair}`))).toBe(true);
  });

  test('is held by the cookie a code bought behind a cookie of the same name that another port\'s page set on a longer path', () => {
    const { sessionCodes } = sessionCodesOnAClock();
    const cookiePair = cookiePairOf(exchangedSetCookieHeader(sessionCodes));
    expect(sessionCodes.requestHoldsSession(requestWithCookie(`${COOKIE_NAME}=${'0'.repeat(64)}; ${cookiePair}`))).toBe(true);
  });

  test('outlives the code\'s life', () => {
    const { sessionCodes, advanceClock } = sessionCodesOnAClock();
    const cookiePair = cookiePairOf(exchangedSetCookieHeader(sessionCodes));
    advanceClock(SESSION_CODE_LIFETIME_MILLISECONDS * 2);
    expect(sessionCodes.requestHoldsSession(requestWithCookie(cookiePair))).toBe(true);
  });

  test('is not held by a request with no cookie', () => {
    const { sessionCodes } = sessionCodesOnAClock();
    exchangedSetCookieHeader(sessionCodes);
    expect(sessionCodes.requestHoldsSession(requestWithCookie(null))).toBe(false);
  });

  test('is not held by a forged secret', () => {
    const { sessionCodes } = sessionCodesOnAClock();
    exchangedSetCookieHeader(sessionCodes);
    expect(sessionCodes.requestHoldsSession(requestWithCookie(`${COOKIE_NAME}=${'0'.repeat(64)}`))).toBe(false);
  });

  test('is not held by an empty cookie', () => {
    const { sessionCodes } = sessionCodesOnAClock();
    expect(sessionCodes.requestHoldsSession(requestWithCookie(`${COOKIE_NAME}=`))).toBe(false);
  });

  test('is not held by the right secret under another port\'s cookie name', () => {
    const { sessionCodes } = sessionCodesOnAClock();
    const secret = cookiePairOf(exchangedSetCookieHeader(sessionCodes)).slice(COOKIE_NAME.length + 1);
    expect(sessionCodes.requestHoldsSession(requestWithCookie(`example-session-4791=${secret}`))).toBe(false);
  });

  test('is not held by a cookie another instance issued, as after a restart', () => {
    const issuingSessionCodes = sessionCodesOnAClock().sessionCodes;
    const cookiePair = cookiePairOf(exchangedSetCookieHeader(issuingSessionCodes));
    expect(sessionCodesOnAClock().sessionCodes.requestHoldsSession(requestWithCookie(cookiePair))).toBe(false);
  });
});
