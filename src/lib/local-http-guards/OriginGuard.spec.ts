/**
 * The Origin check: no Origin or the server's own passes, anything else is refused. The cases that matter are a page of another origin,
 * the text `null` that a sandboxed frame or a file page sends, the server's own address on another port or scheme, and a preflight, which
 * is refused even from the server's own origin because no route grants cross-origin permission.
 */
import { describe, expect, test } from 'bun:test';

import { originGuardVerdictFor } from './OriginGuard.ts';

const SERVER_PORT = 4790;

function requestFrom(origin: string | null, method = 'GET'): Request {
  return new Request(`http://127.0.0.1:${SERVER_PORT}/api/commands`, origin === null ? { method } : { method, headers: { origin } });
}

describe('the Origin guard', () => {
  test('admits a request with no Origin, as a local program sends it', () => {
    expect(originGuardVerdictFor(requestFrom(null), SERVER_PORT)).toBe('admitted');
  });

  test('admits the server\'s own origin by its address', () => {
    expect(originGuardVerdictFor(requestFrom(`http://127.0.0.1:${SERVER_PORT}`, 'POST'), SERVER_PORT)).toBe('admitted');
  });

  test('admits the server\'s own origin by the name localhost', () => {
    expect(originGuardVerdictFor(requestFrom(`http://localhost:${SERVER_PORT}`, 'POST'), SERVER_PORT)).toBe('admitted');
  });

  test('refuses a foreign Origin', () => {
    expect(originGuardVerdictFor(requestFrom('https://foreign.example', 'POST'), SERVER_PORT)).toBe('foreign-origin');
  });

  test('refuses the loopback address on another port, another server of the same machine', () => {
    expect(originGuardVerdictFor(requestFrom(`http://127.0.0.1:${SERVER_PORT + 1}`, 'POST'), SERVER_PORT)).toBe('foreign-origin');
  });

  test('refuses the loopback address over another scheme', () => {
    expect(originGuardVerdictFor(requestFrom(`https://127.0.0.1:${SERVER_PORT}`, 'POST'), SERVER_PORT)).toBe('foreign-origin');
  });

  test('refuses the text null as Origin', () => {
    expect(originGuardVerdictFor(requestFrom('null', 'POST'), SERVER_PORT)).toBe('opaque-origin');
  });

  test('refuses a preflight from a foreign origin', () => {
    expect(originGuardVerdictFor(requestFrom('https://foreign.example', 'OPTIONS'), SERVER_PORT)).toBe('preflight');
  });

  test('refuses a preflight even from the server\'s own origin', () => {
    expect(originGuardVerdictFor(requestFrom(`http://127.0.0.1:${SERVER_PORT}`, 'OPTIONS'), SERVER_PORT)).toBe('preflight');
  });
});
