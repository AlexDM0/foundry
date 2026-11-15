/**
 * The clock answers the stamp every injected `now` hands on, an ISO 8601 instant in UTC that parses back to a time, and the monotonic
 * milliseconds a bounded life is measured in, which never run backwards; its real timers call back after their delay unless cancelled.
 */
import { describe, expect, test } from 'bun:test';

import { monotonicMillisecondsOfNow, realClockTimers, stampOfNow } from './Clock.ts';

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

describe('the real timers', () => {
  test('call back after their delay, and a cancelled one never does', async () => {
    const timers = realClockTimers();
    let cancelledFired = false;
    timers.start(() => {
      cancelledFired = true;
    }, 0).cancel();
    await new Promise<void>((resolve) => {
      timers.start(resolve, 0);
    });
    expect(cancelledFired).toBe(false);
  });
});
