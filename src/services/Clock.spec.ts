/**
 * The clock answers the stamp every injected `now` hands on, an ISO 8601 instant in UTC that parses back to a time, and the monotonic
 * milliseconds a bounded life is measured in, which never run backwards.
 */
import { describe, expect, test } from 'bun:test';

import { monotonicMillisecondsOfNow, stampOfNow } from './Clock.ts';

describe('the wall clock', () => {
  test('answers an ISO 8601 instant in UTC that parses back to a time', () => {
    const stamp = stampOfNow();
    expect(stamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(Number.isNaN(Date.parse(stamp))).toBe(false);
  });
});

describe('the monotonic clock', () => {
  test('answers milliseconds that never run backwards', () => {
    const earlier = monotonicMillisecondsOfNow();
    expect(monotonicMillisecondsOfNow()).toBeGreaterThanOrEqual(earlier);
  });
});
