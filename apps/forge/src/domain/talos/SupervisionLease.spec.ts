/**
 * The lease decides when Talos stops its agents. What matters: steady renewals keep it held and a minute of silence ends it exactly once;
 * a gap in Talos's own ticks (a sleep, a suspension, a clock moved back) never ends it at once but grants one renewal interval, two below
 * five seconds, and a further gap extends that grace; a lease never renewed never ends, and a renewal after the end holds it again.
 */
import { expect, test } from 'bun:test';

import {
  createSupervisionLease,
  gapLengthOf,
  type LeaseBounds,
  type SupervisionLease
} from './SupervisionLease.ts';

const SECOND_MILLISECONDS = 1000;
const MINUTE_MILLISECONDS = 60 * SECOND_MILLISECONDS;
const HOUR_MILLISECONDS = 60 * MINUTE_MILLISECONDS;
const START_WALL_MILLISECONDS = 1_800_000_000_000;

const PRODUCTION_BOUNDS: LeaseBounds = {
  leaseMilliseconds:           MINUTE_MILLISECONDS,
  renewalIntervalMilliseconds: 15 * SECOND_MILLISECONDS,
  tickMilliseconds:            SECOND_MILLISECONDS,
  tickGapMilliseconds:         5 * SECOND_MILLISECONDS,
};

/** A fake wall clock driving one lease: `tickUntil` ticks once a second and collects every answer. */
function leaseOnFakeClock(bounds: LeaseBounds): {
  lease:     SupervisionLease;
  wallNow:   () => number;
  jump:      (milliseconds: number) => void;
  tickUntil: (endWallMilliseconds: number, renewEveryMilliseconds?: number) => Array<'lease-ended' | null>;
} {
  let wallNow = START_WALL_MILLISECONDS;
  const lease = createSupervisionLease(bounds, wallNow);
  let lastRenewalWall = wallNow;
  return {
    lease,
    wallNow:   () => wallNow,
    jump:      (milliseconds) => { wallNow += milliseconds; },
    tickUntil: (endWallMilliseconds, renewEveryMilliseconds) => {
      const answers: Array<'lease-ended' | null> = [];
      while (wallNow + bounds.tickMilliseconds <= endWallMilliseconds) {
        wallNow += bounds.tickMilliseconds;
        if (renewEveryMilliseconds !== undefined && wallNow - lastRenewalWall >= renewEveryMilliseconds) {
          lease.renewed(wallNow);
          lastRenewalWall = wallNow;
        }
        answers.push(lease.ticked(wallNow));
      }
      return answers;
    },
  };
}

function endingsIn(answers: ReadonlyArray<'lease-ended' | null>): number {
  return answers.filter((answer) => answer === 'lease-ended').length;
}

test('a lease renewed every 15 seconds never ends', () => {
  const clock = leaseOnFakeClock(PRODUCTION_BOUNDS);
  clock.lease.renewed(clock.wallNow());
  const answers = clock.tickUntil(START_WALL_MILLISECONDS + HOUR_MILLISECONDS, PRODUCTION_BOUNDS.renewalIntervalMilliseconds);
  expect(endingsIn(answers)).toBe(0);
  expect(clock.lease.standing()).toBe('held');
});

test('silence for 60 seconds after a renewal ends the lease once, at the tick a minute after the renewal', () => {
  const clock = leaseOnFakeClock(PRODUCTION_BOUNDS);
  clock.lease.renewed(clock.wallNow());
  expect(endingsIn(clock.tickUntil(START_WALL_MILLISECONDS + MINUTE_MILLISECONDS - SECOND_MILLISECONDS))).toBe(0);
  expect(clock.lease.standing()).toBe('held');
  expect(clock.tickUntil(START_WALL_MILLISECONDS + MINUTE_MILLISECONDS)).toEqual(['lease-ended']);
  expect(clock.lease.standing()).toBe('ended');
  expect(endingsIn(clock.tickUntil(START_WALL_MILLISECONDS + HOUR_MILLISECONDS))).toBe(0);
});

test('a jump of 3 hours between two ticks ends nothing at once, and a renewal within 15 seconds after it keeps the lease held', () => {
  const clock = leaseOnFakeClock(PRODUCTION_BOUNDS);
  clock.lease.renewed(clock.wallNow());
  clock.tickUntil(START_WALL_MILLISECONDS + 10 * SECOND_MILLISECONDS);
  clock.jump(3 * HOUR_MILLISECONDS);
  expect(clock.lease.ticked(clock.wallNow())).toBeNull();
  expect(clock.lease.standing()).toBe('waiting-after-gap');
  const jumpWall = clock.wallNow();
  expect(endingsIn(clock.tickUntil(jumpWall + 14 * SECOND_MILLISECONDS))).toBe(0);
  clock.lease.renewed(clock.wallNow());
  expect(clock.lease.standing()).toBe('held');
  expect(endingsIn(clock.tickUntil(jumpWall + 10 * MINUTE_MILLISECONDS, PRODUCTION_BOUNDS.renewalIntervalMilliseconds))).toBe(0);
  expect(clock.lease.standing()).toBe('held');
});

test('with no renewal 15 seconds after a jump the lease ends, once', () => {
  const clock = leaseOnFakeClock(PRODUCTION_BOUNDS);
  clock.lease.renewed(clock.wallNow());
  clock.jump(3 * HOUR_MILLISECONDS);
  expect(clock.lease.ticked(clock.wallNow())).toBeNull();
  const jumpWall = clock.wallNow();
  expect(endingsIn(clock.tickUntil(jumpWall + 14 * SECOND_MILLISECONDS))).toBe(0);
  expect(clock.tickUntil(jumpWall + 15 * SECOND_MILLISECONDS)).toEqual(['lease-ended']);
  expect(clock.lease.standing()).toBe('ended');
});

test('with a renewal interval of 2 seconds the grace after a gap is 4 seconds', () => {
  const shortBounds: LeaseBounds = { ...PRODUCTION_BOUNDS, renewalIntervalMilliseconds: 2 * SECOND_MILLISECONDS };
  const clock = leaseOnFakeClock(shortBounds);
  clock.lease.renewed(clock.wallNow());
  clock.jump(HOUR_MILLISECONDS);
  expect(clock.lease.ticked(clock.wallNow())).toBeNull();
  const jumpWall = clock.wallNow();
  expect(clock.tickUntil(jumpWall + 4 * SECOND_MILLISECONDS)).toEqual([null, null, null, 'lease-ended']);
});

test('a clock that moves back is a gap, which grants the grace instead of ending or holding the lease', () => {
  const clock = leaseOnFakeClock(PRODUCTION_BOUNDS);
  clock.lease.renewed(clock.wallNow());
  clock.tickUntil(START_WALL_MILLISECONDS + 5 * SECOND_MILLISECONDS);
  clock.jump(-HOUR_MILLISECONDS);
  expect(clock.lease.ticked(clock.wallNow())).toBeNull();
  expect(clock.lease.standing()).toBe('waiting-after-gap');
  const backWall = clock.wallNow();
  expect(clock.tickUntil(backWall + 15 * SECOND_MILLISECONDS).slice(-2)).toEqual([null, 'lease-ended']);
});

test('a second gap during the grace extends the grace from the second gap', () => {
  const clock = leaseOnFakeClock(PRODUCTION_BOUNDS);
  clock.lease.renewed(clock.wallNow());
  clock.jump(HOUR_MILLISECONDS);
  expect(clock.lease.ticked(clock.wallNow())).toBeNull();
  clock.tickUntil(clock.wallNow() + 10 * SECOND_MILLISECONDS);
  clock.jump(HOUR_MILLISECONDS);
  expect(clock.lease.ticked(clock.wallNow())).toBeNull();
  expect(clock.lease.standing()).toBe('waiting-after-gap');
  const secondJumpWall = clock.wallNow();
  expect(endingsIn(clock.tickUntil(secondJumpWall + 14 * SECOND_MILLISECONDS))).toBe(0);
  expect(clock.tickUntil(secondJumpWall + 15 * SECOND_MILLISECONDS)).toEqual(['lease-ended']);
});

test('a tick late by no more than the tick gap allowance is no gap', () => {
  const clock = leaseOnFakeClock(PRODUCTION_BOUNDS);
  clock.lease.renewed(clock.wallNow());
  clock.jump(PRODUCTION_BOUNDS.tickMilliseconds + PRODUCTION_BOUNDS.tickGapMilliseconds);
  expect(clock.lease.ticked(clock.wallNow())).toBeNull();
  expect(clock.lease.standing()).toBe('held');
});

test('an unheld lease never ends, through silence and gaps alike', () => {
  const clock = leaseOnFakeClock(PRODUCTION_BOUNDS);
  expect(clock.lease.standing()).toBe('unheld');
  expect(endingsIn(clock.tickUntil(START_WALL_MILLISECONDS + 10 * MINUTE_MILLISECONDS))).toBe(0);
  clock.jump(3 * HOUR_MILLISECONDS);
  expect(clock.lease.ticked(clock.wallNow())).toBeNull();
  expect(endingsIn(clock.tickUntil(clock.wallNow() + 10 * MINUTE_MILLISECONDS))).toBe(0);
  expect(clock.lease.standing()).toBe('unheld');
});

test('a renewal after the lease ended holds it again, and a later silence ends it again', () => {
  const clock = leaseOnFakeClock(PRODUCTION_BOUNDS);
  clock.lease.renewed(clock.wallNow());
  expect(endingsIn(clock.tickUntil(START_WALL_MILLISECONDS + 2 * MINUTE_MILLISECONDS))).toBe(1);
  clock.lease.renewed(clock.wallNow());
  expect(clock.lease.standing()).toBe('held');
  const renewalWall = clock.wallNow();
  expect(endingsIn(clock.tickUntil(renewalWall + MINUTE_MILLISECONDS - SECOND_MILLISECONDS))).toBe(0);
  expect(clock.tickUntil(renewalWall + MINUTE_MILLISECONDS)).toEqual(['lease-ended']);
});

test('the gap length is the time past one tick, 0 for a tick on time, early or after a clock moved back', () => {
  expect(gapLengthOf(START_WALL_MILLISECONDS, START_WALL_MILLISECONDS + SECOND_MILLISECONDS, SECOND_MILLISECONDS)).toBe(0);
  expect(gapLengthOf(START_WALL_MILLISECONDS, START_WALL_MILLISECONDS + 400, SECOND_MILLISECONDS)).toBe(0);
  expect(gapLengthOf(START_WALL_MILLISECONDS, START_WALL_MILLISECONDS + HOUR_MILLISECONDS, SECOND_MILLISECONDS)).toBe(HOUR_MILLISECONDS - SECOND_MILLISECONDS);
  expect(gapLengthOf(START_WALL_MILLISECONDS, START_WALL_MILLISECONDS - HOUR_MILLISECONDS, SECOND_MILLISECONDS)).toBe(0);
});
