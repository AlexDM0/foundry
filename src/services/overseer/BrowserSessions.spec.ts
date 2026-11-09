/**
 * The browser sessions against an injected clock. What matters: a code buys a session only within `SESSION_CODE_LIFETIME_SECONDS` of its
 * issue, and only once; a late exchange spends the code all the same, so it cannot be tried again; a secret nobody issued opens nothing.
 */
import { describe, expect, test } from 'bun:test';

import { SESSION_CODE_LIFETIME_SECONDS } from '../../shared/constants/OverseerLimits.ts';
import { createBrowserSessions }         from './BrowserSessions.ts';
import { MILLISECONDS_PER_SECOND }       from './constants/TimeUnits.ts';

const ISSUE_EPOCH_MILLISECONDS = Date.parse('2026-10-29T20:00:00Z');
const LIFETIME_MILLISECONDS = SESSION_CODE_LIFETIME_SECONDS * MILLISECONDS_PER_SECOND;

function sessionsOnAClock() {
  let epochMilliseconds = ISSUE_EPOCH_MILLISECONDS;
  const sessions = createBrowserSessions(() => new Date(epochMilliseconds));
  return {
    sessions,
    moveClockTo: (millisecondsAfterIssue: number) => {
      epochMilliseconds = ISSUE_EPOCH_MILLISECONDS + millisecondsAfterIssue;
    },
  };
}

describe('BrowserSessions', () => {
  test('A1: a code exchanged one millisecond past its life buys no session', () => {
    const { sessions, moveClockTo } = sessionsOnAClock();
    const code = sessions.issueCode();
    moveClockTo(LIFETIME_MILLISECONDS + 1);
    expect(sessions.exchangeCode(code)).toBeNull();
  });

  test('A1: a code refused as too old stays spent once the clock is back inside its life', () => {
    const { sessions, moveClockTo } = sessionsOnAClock();
    const code = sessions.issueCode();
    moveClockTo(LIFETIME_MILLISECONDS + 1);
    sessions.exchangeCode(code);
    moveClockTo(0);
    expect(sessions.exchangeCode(code)).toBeNull();
  });

  test('A2: a code exchanged at the end of its life buys a session the sessions then hold, and only once', () => {
    const { sessions, moveClockTo } = sessionsOnAClock();
    const code = sessions.issueCode();
    moveClockTo(LIFETIME_MILLISECONDS);
    const sessionSecret = sessions.exchangeCode(code);
    expect(sessionSecret).not.toBeNull();
    expect(sessions.holdsSession(sessionSecret ?? '')).toBe(true);
    expect(sessions.exchangeCode(code)).toBeNull();
  });

  test('a code never issued buys nothing, and a secret never issued holds no session', () => {
    const { sessions } = sessionsOnAClock();
    expect(sessions.exchangeCode('0a1b2c3d')).toBeNull();
    expect(sessions.holdsSession('0a1b2c3d')).toBe(false);
  });

  test('an expired code is let go when a later code is issued, and the later code still buys a session', () => {
    const { sessions, moveClockTo } = sessionsOnAClock();
    const expiredCode = sessions.issueCode();
    moveClockTo(LIFETIME_MILLISECONDS + 1);
    const laterCode = sessions.issueCode();
    expect(sessions.exchangeCode(expiredCode)).toBeNull();
    expect(sessions.exchangeCode(laterCode)).not.toBeNull();
  });
});
