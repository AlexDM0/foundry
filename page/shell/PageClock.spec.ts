/**
 * The page's clock. What matters: a reading stays the same between ticks, so React's external-store hook sees one value per render; it
 * ticks only while a view listens, and the last listener leaving cancels the schedule, so a page with no age on screen runs no timer.
 */
import { describe, expect, test } from 'bun:test';

import { PageClock } from './PageClock.ts';

function clockOverScheduledTicks(readings: readonly number[]) {
  let readCount = 0;
  const scheduled: { task: () => void; intervalMilliseconds: number; cancelled: boolean }[] = [];
  const clock = PageClock.create({
    readClock: () => {
      const reading = readings[Math.min(readCount, readings.length - 1)] ?? 0;
      readCount += 1;
      return reading;
    },
    scheduleRepeating: (task, intervalMilliseconds) => {
      const entry = { task, intervalMilliseconds, cancelled: false };
      scheduled.push(entry);
      return () => {
        entry.cancelled = true;
      };
    },
    timeZone: 'UTC',
  });
  return { clock, scheduled };
}

describe('the page clock', () => {
  test('keeps one reading until its next tick, and tells its listeners at each tick', () => {
    const { clock, scheduled } = clockOverScheduledTicks([1_000, 2_000, 3_000]);
    let heard = 0;
    clock.subscribe(() => {
      heard += 1;
    });
    expect([clock.now(), clock.now()]).toEqual([2_000, 2_000]);
    scheduled[0]?.task();
    expect([clock.now(), heard]).toEqual([3_000, 1]);
    expect(scheduled.map((entry) => entry.intervalMilliseconds)).toEqual([PageClock.PAGE_CLOCK_TICK_MILLISECONDS]);
  });

  test('ticks only while listened to: one schedule for every listener, cancelled when the last one leaves', () => {
    const { clock, scheduled } = clockOverScheduledTicks([1_000]);
    expect(scheduled).toEqual([]);
    const leaveFirst = clock.subscribe(() => undefined);
    const leaveSecond = clock.subscribe(() => undefined);
    expect(scheduled).toHaveLength(1);
    leaveFirst();
    expect(scheduled[0]?.cancelled).toBe(false);
    leaveSecond();
    expect(scheduled[0]?.cancelled).toBe(true);
    clock.subscribe(() => undefined);
    expect(scheduled.map((entry) => entry.cancelled)).toEqual([true, false]);
  });

  test('prints in the time zone its surroundings name', () => {
    expect(clockOverScheduledTicks([0]).clock.timeZone).toBe('UTC');
  });
});
