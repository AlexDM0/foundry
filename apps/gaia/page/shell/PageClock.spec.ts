/**
 * The page's clock: a reading stays the same between ticks, so React's external-store hook sees one value per render; it ticks only while
 * someone listens, every second only while someone holds second ticks, and no timer outlives the page's root. The spec runs every tick by hand.
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

  test('a hold moves a running schedule to one tick a second from a fresh reading, and the last release moves it back', () => {
    const { clock, scheduled } = clockOverScheduledTicks([1_000, 2_000, 3_000, 4_000]);
    let heard = 0;
    clock.subscribe(() => {
      heard += 1;
    });
    const releaseFirst = clock.holdSecondTicks();
    const releaseSecond = clock.holdSecondTicks();
    expect(scheduled.map((entry) => [entry.intervalMilliseconds, entry.cancelled])).toEqual([
      [PageClock.PAGE_CLOCK_TICK_MILLISECONDS, true],
      [PageClock.PAGE_CLOCK_SECOND_TICK_MILLISECONDS, false],
    ]);
    expect([clock.now(), heard]).toEqual([3_000, 1]);
    releaseFirst();
    releaseFirst();
    expect(scheduled).toHaveLength(2);
    releaseSecond();
    expect(scheduled.map((entry) => [entry.intervalMilliseconds, entry.cancelled]).at(-1)).toEqual([PageClock.PAGE_CLOCK_TICK_MILLISECONDS, false]);
    expect(scheduled[1]?.cancelled).toBe(true);
  });

  test('a hold taken before anyone listens schedules nothing, and the first listener then ticks every second', () => {
    const { clock, scheduled } = clockOverScheduledTicks([1_000]);
    clock.holdSecondTicks();
    expect(scheduled).toEqual([]);
    clock.subscribe(() => undefined);
    expect(scheduled.map((entry) => entry.intervalMilliseconds)).toEqual([PageClock.PAGE_CLOCK_SECOND_TICK_MILLISECONDS]);
  });
});
