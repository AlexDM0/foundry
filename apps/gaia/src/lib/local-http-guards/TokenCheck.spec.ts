/**
 * The bearer-token check: only the server's own token passes, and the compare runs in constant time. The cases that matter are a wrong
 * token of the same length, a token of another length, which a plain `timingSafeEqual` would throw on, and a server that holds no token.
 */
import * as crypto from 'node:crypto';
import {
  describe,
  expect,
  spyOn,
  test
} from 'bun:test';

import { bearerTokenMatches, tokensMatch } from './TokenCheck.ts';

const SERVER_TOKEN = 'a'.repeat(64);

const DIGEST_BYTES = 32;

function requestWithAuthorization(authorization: string | null): Request {
  return new Request('http://127.0.0.1:4790/api/session-codes', authorization === null
    ? { method: 'POST' }
    : { method: 'POST', headers: { authorization } });
}

describe('the bearer-token check', () => {
  test('admits the server\'s own token', () => {
    expect(bearerTokenMatches(requestWithAuthorization(`Bearer ${SERVER_TOKEN}`), SERVER_TOKEN)).toBe(true);
  });

  test('refuses a wrong token of the same length', () => {
    expect(bearerTokenMatches(requestWithAuthorization(`Bearer ${'b'.repeat(64)}`), SERVER_TOKEN)).toBe(false);
  });

  test('refuses a token of another length without throwing', () => {
    expect(bearerTokenMatches(requestWithAuthorization(`Bearer ${SERVER_TOKEN}a`), SERVER_TOKEN)).toBe(false);
  });

  test('refuses a request with no Authorization', () => {
    expect(bearerTokenMatches(requestWithAuthorization(null), SERVER_TOKEN)).toBe(false);
  });

  test('refuses the token under another scheme', () => {
    expect(bearerTokenMatches(requestWithAuthorization(`Basic ${SERVER_TOKEN}`), SERVER_TOKEN)).toBe(false);
  });

  test('refuses every request while the server holds no token', () => {
    expect(bearerTokenMatches(requestWithAuthorization('Bearer '), null)).toBe(false);
  });

  test('refuses an empty token even against an empty server token', () => {
    expect(bearerTokenMatches(requestWithAuthorization('Bearer '), '')).toBe(false);
  });
});

describe('the token compare', () => {
  test('runs through timingSafeEqual on two digests of one length, whatever the offered token\'s length', () => {
    const timingSafeEqualSpy = spyOn(crypto, 'timingSafeEqual');
    try {
      tokensMatch('short', SERVER_TOKEN);
      expect(timingSafeEqualSpy).toHaveBeenCalledTimes(1);
      const [offeredDigest, expectedDigest] = timingSafeEqualSpy.mock.calls[0] ?? [];
      expect([offeredDigest?.byteLength, expectedDigest?.byteLength]).toEqual([DIGEST_BYTES, DIGEST_BYTES]);
    } finally {
      timingSafeEqualSpy.mockRestore();
    }
  });
});
