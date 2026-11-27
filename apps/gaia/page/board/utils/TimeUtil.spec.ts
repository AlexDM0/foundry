/**
 * The one stamp formatter: the three forms a stamp takes against the viewer's day, a stamp compared as written whatever its offset, the
 * local instant forms checked against the instant's own local date, the chat's seconds clock, and durations at unit boundaries and backwards.
 */

import { describe, expect, test }                        from 'bun:test';
import { EXAMPLE_BOARD_LIMITS }                          from '../testing/PageLimitsFixture.ts';
import { EXAMPLE_PAGE_LIMITS, EXAMPLE_TIMESTAMP_SLICES } from '../testing/TimestampSlicesFixture.ts';
import { TimeUtil }                                      from './TimeUtil.ts';

const {
  calendarDateOf,
  clockOf,
  formatDuration,
  fullInstantText,
  fullStampText,
  monthAndDayOf,
  monthDayAndClockText,
  secondsClockText,
  shortInstantText,
  shortStampText,
  stampIsFromDay,
  timestampSlicesOf,
} = TimeUtil;

const EXAMPLE_TODAY = '2026-09-18';

const MILLISECONDS_PER_DAY = 86_400_000;

const LOCAL_CLOCK = /^\d\d:\d\d$/;

describe('stampIsFromDay', () => {
  test('compares the date the stamp was written on, whatever offset it carries', () => {
    expect(stampIsFromDay('2026-09-18T23:30:00-05:00', EXAMPLE_TODAY, EXAMPLE_TIMESTAMP_SLICES)).toBe(true);
    expect(stampIsFromDay('2026-09-17T23:48:00+02:00', EXAMPLE_TODAY, EXAMPLE_TIMESTAMP_SLICES)).toBe(false);
  });
});

describe('shortStampText', () => {
  test('shows only the clock of a stamp from today', () => {
    expect(shortStampText('2026-09-18T20:44:00+02:00', EXAMPLE_TODAY, EXAMPLE_TIMESTAMP_SLICES)).toBe('20:44');
  });

  test('puts the month and day in front of a stamp from another day of the same year', () => {
    expect(shortStampText('2026-09-17T23:48:00+02:00', EXAMPLE_TODAY, EXAMPLE_TIMESTAMP_SLICES)).toBe('09-17 23:48');
  });

  // In the viewer's zone this instant may fall on the 19th; the stamp keeps the wall clock of the machine that wrote it, so it is today's.
  test('reads the date as written, whatever offset the stamp carries', () => {
    expect(shortStampText('2026-09-18T23:30:00-05:00', EXAMPLE_TODAY, EXAMPLE_TIMESTAMP_SLICES)).toBe('23:30');
  });

  test('shows a stamp from another year in full', () => {
    expect(shortStampText('2025-12-31T23:48:00+01:00', '2026-01-01', EXAMPLE_TIMESTAMP_SLICES)).toBe('2025-12-31 23:48');
  });
});

describe('fullStampText', () => {
  test('is the date and the clock, the form every hover shows', () => {
    expect(fullStampText('2026-09-18T20:44:00+02:00', EXAMPLE_TIMESTAMP_SLICES)).toBe('2026-09-18 20:44');
  });
});

describe('the instant forms', () => {
  const instant = Date.UTC(2026, 8, 18, 12, 0, 0);
  const today   = calendarDateOf(instant);

  test('names the viewer\'s local day of an instant', () => {
    const moment = new Date(instant);

    expect(today).toMatch(/^\d{4}-\d\d-\d\d$/);
    expect(Number(today.slice(8))).toBe(moment.getDate());
    expect(Number(today.slice(0, 4))).toBe(moment.getFullYear());
  });

  test('shows only the local clock of an instant from today, and the date and clock in full', () => {
    const shown = shortInstantText(instant, today);

    expect(shown).toMatch(LOCAL_CLOCK);
    expect(fullInstantText(instant)).toBe(`${today} ${shown}`);
  });

  test('dates an instant from another day of the same year by month and day', () => {
    const yesterday = instant - MILLISECONDS_PER_DAY;

    expect(shortInstantText(yesterday, today)).toBe(fullInstantText(yesterday).slice(5));
  });

  test('shows an instant from another year in full', () => {
    const lastYear = instant - 365 * MILLISECONDS_PER_DAY;

    expect(shortInstantText(lastYear, today)).toBe(fullInstantText(lastYear));
    expect(fullInstantText(lastYear)).toMatch(/^2025-\d\d-\d\d \d\d:\d\d$/);
  });
});

describe('secondsClockText', () => {
  const instant = Date.UTC(2026, 8, 18, 12, 0, 7);
  const today   = calendarDateOf(instant);

  test('shows the local clock with seconds of an instant from today', () => {
    expect(secondsClockText(instant, today)).toBe(`${shortInstantText(instant, today)}:07`);
  });

  test('puts the month and day in front of an instant from another day of the same year', () => {
    const yesterday = instant - MILLISECONDS_PER_DAY;

    expect(secondsClockText(yesterday, today)).toBe(`${fullInstantText(yesterday).slice(5)}:07`);
  });

  test('shows an instant from another year with its full date', () => {
    const lastYear = instant - 365 * MILLISECONDS_PER_DAY;

    expect(secondsClockText(lastYear, today)).toBe(`${fullInstantText(lastYear)}:07`);
  });
});

describe('the local clock and month-day of a moment', () => {
  const moment = new Date(2026, 0, 5, 7, 3);

  test('clockOf pads hours and minutes to two digits', () => {
    expect(clockOf(moment)).toBe('07:03');
  });

  test('monthAndDayOf counts months from one and pads both parts', () => {
    expect(monthAndDayOf(moment)).toBe('01-05');
  });

  test('monthDayAndClockText joins the month and day to the clock', () => {
    expect(monthDayAndClockText(moment.getTime())).toBe('01-05 07:03');
  });
});


describe('formatDuration', () => {
  test.each<[number, string]>([
    [0, 'under a minute'],
    [30_000, 'under a minute'],
    [60_000, '1m'],
    [45 * 60_000, '45m'],
    [60 * 60_000, '1h'],
    [135 * 60_000, '2h 15m'],
    [26 * 60 * 60_000, '1d 2h'],
    [48 * 60 * 60_000, '2d'],
  ])('reads %i milliseconds as %s', (milliseconds, expected) => {
    expect(formatDuration(milliseconds, EXAMPLE_PAGE_LIMITS)).toBe(expected);
  });

  // A backfilled `--at` can put a later phase earlier; a negative span is no duration at all, neither "-3m" nor "under a minute".
  test('names no duration for a span that runs backwards', () => {
    expect(formatDuration(-180_000, EXAMPLE_PAGE_LIMITS)).toBeNull();
    expect(formatDuration(-1, EXAMPLE_PAGE_LIMITS)).toBeNull();
  });
});

describe('timestampSlicesOf', () => {
  test('the stamp slices are the board\'s limits\' own', () => {
    expect(timestampSlicesOf({ limits: EXAMPLE_BOARD_LIMITS })).toEqual(EXAMPLE_TIMESTAMP_SLICES);
  });
});
