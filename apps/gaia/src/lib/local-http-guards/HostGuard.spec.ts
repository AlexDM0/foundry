/**
 * The Host check against DNS rebinding: only a loopback name with the server's own port passes. The cases that matter are a foreign name
 * on the right port, which is what a rebound page sends, the right name on another port, and a request with no Host at all.
 */
import { describe, expect, test } from 'bun:test';

import { hostGuardVerdictFor } from './HostGuard.ts';

const SERVER_PORT = 4790;

function requestWithHost(host: string | null): Request {
  return new Request(`http://127.0.0.1:${SERVER_PORT}/api/fleet`, host === null ? {} : { headers: { host } });
}

describe('the Host guard', () => {
  test('admits the server by its address and its own port', () => {
    expect(hostGuardVerdictFor(requestWithHost(`127.0.0.1:${SERVER_PORT}`), SERVER_PORT)).toBe('admitted');
  });

  test('admits the server by the name localhost and its own port', () => {
    expect(hostGuardVerdictFor(requestWithHost(`localhost:${SERVER_PORT}`), SERVER_PORT)).toBe('admitted');
  });

  test('refuses a rebound Host: a foreign name on the server\'s own port', () => {
    expect(hostGuardVerdictFor(requestWithHost(`rebound.example:${SERVER_PORT}`), SERVER_PORT)).toBe('foreign-host');
  });

  test('refuses the loopback address on another port', () => {
    expect(hostGuardVerdictFor(requestWithHost(`127.0.0.1:${SERVER_PORT + 1}`), SERVER_PORT)).toBe('foreign-host');
  });

  test('refuses a Host with no port', () => {
    expect(hostGuardVerdictFor(requestWithHost('127.0.0.1'), SERVER_PORT)).toBe('foreign-host');
  });

  test('refuses a request with no Host', () => {
    expect(hostGuardVerdictFor(requestWithHost(null), SERVER_PORT)).toBe('foreign-host');
  });
});
