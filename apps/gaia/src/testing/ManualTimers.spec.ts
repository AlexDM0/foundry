/**
 * The hand-fired timers every watch spec runs on: a timer fires only when the spec fires its delay, a cancelled one never does, not even
 * when another due timer's callback cancels it, firing a delay with nothing pending fails the spec, and a wait for a timer settles when one
 * starts, never by time passing.
 */
import { describe, expect, test } from 'bun:test';

import { manualTimers } from './ManualTimers.ts';

describe('firing', () => {
  test('fires every pending timer of the delay it is given and leaves the others pending', () => {
    const timers = manualTimers();
    const fired: string[] = [];
    timers.start(() => fired.push('first short'), 1_000);
    timers.start(() => fired.push('long'), 2_000);
    timers.start(() => fired.push('second short'), 1_000);

    expect(timers.fire(1_000)).toBe(2);
    expect(fired).toEqual(['first short', 'second short']);
    expect(timers.pendingDelays()).toEqual([2_000]);
  });

  test('never fires a cancelled timer', () => {
    const timers = manualTimers();
    let cancelledFired = false;
    timers.start(() => {
      cancelledFired = true;
    }, 1_000).cancel();

    expect(timers.pendingDelays()).toEqual([]);
    expect(() => timers.fire(1_000)).toThrow('No timer of 1000 ms is pending');
    expect(cancelledFired).toBe(false);
  });

  test('never fires a due timer that an earlier due timer cancelled, and leaves every other pending timer standing', () => {
    const timers = manualTimers();
    const fired: string[] = [];
    let secondTimer: { readonly cancel: () => void } | null = null;
    timers.start(() => {
      fired.push('first');
      secondTimer?.cancel();
    }, 1_000);
    secondTimer = timers.start(() => fired.push('second'), 1_000);
    timers.start(() => fired.push('unrelated'), 2_000);

    expect(timers.fire(1_000)).toBe(1);
    expect(fired).toEqual(['first']);
    expect(timers.pendingDelays()).toEqual([2_000]);
  });
});

describe('waiting', () => {
  test('settles at once when a timer of the delay is pending, and when one starts otherwise', async () => {
    const timers = manualTimers();
    timers.start(() => undefined, 1_000);
    await timers.untilPending(1_000);

    const waitForLong = timers.untilPending(2_000);
    timers.start(() => undefined, 2_000);
    await waitForLong;
    expect(timers.pendingDelays()).toEqual([1_000, 2_000]);
  });
});
