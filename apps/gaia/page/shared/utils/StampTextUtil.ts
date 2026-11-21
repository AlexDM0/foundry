/**
 * A forge's stamp as the page prints it: an age against the page's clock (`4m`, `2h 04m`, `3d 05h`), a clock time in the page's time
 * zone, with its month and day when it is from another day. A stamp that does not parse prints nothing rather than a wrong time. Comparing
 * a stamp with the clock is a stated clock exception: it decides only the text printed.
 */
import type { ClockReading }       from '../@types/ClockReading.ts';
import { MILLISECONDS_PER_MINUTE } from '../constants/TimeUnits.ts';

const MINUTES_PER_HOUR = 60;
const HOURS_PER_DAY = 24;

const UNDER_A_MINUTE = '<1m';

function padToTwoDigits(value: number): string {
  return String(value).padStart(2, '0');
}

function epochMillisecondsOf(stamp: string): number | null {
  const epochMilliseconds = Date.parse(stamp);
  return Number.isNaN(epochMilliseconds) ? null : epochMilliseconds;
}

/** Minutes alone under an hour, then the two largest units with the smaller one padded; a stamp ahead of the clock reads as under a minute. */
function ageTextOf(stamp: string, nowEpochMilliseconds: number): string | null {
  const stampEpochMilliseconds = epochMillisecondsOf(stamp);
  if (stampEpochMilliseconds === null) return null;
  const totalMinutes = Math.floor((nowEpochMilliseconds - stampEpochMilliseconds) / MILLISECONDS_PER_MINUTE);
  if (totalMinutes < 1) return UNDER_A_MINUTE;
  const totalHours = Math.floor(totalMinutes / MINUTES_PER_HOUR);
  const days = Math.floor(totalHours / HOURS_PER_DAY);
  if (days > 0) return `${days}d ${padToTwoDigits(totalHours % HOURS_PER_DAY)}h`;
  if (totalHours > 0) return `${totalHours}h ${padToTwoDigits(totalMinutes % MINUTES_PER_HOUR)}m`;
  return `${totalMinutes}m`;
}

interface CalendarParts {
  readonly calendarDay: string;
  readonly monthAndDay: string;
  readonly clock:       string;
}

function calendarPartsOf(epochMilliseconds: number, timeZone: string | undefined): CalendarParts {
  const format = new Intl.DateTimeFormat('en-GB', {
    year:      'numeric',
    month:     '2-digit',
    day:       '2-digit',
    hour:      '2-digit',
    minute:    '2-digit',
    hourCycle: 'h23',
    ...(timeZone === undefined ? {} : { timeZone }),
  });
  const parts = new Map(format.formatToParts(epochMilliseconds).map((part) => [part.type, part.value]));
  const monthAndDay = `${parts.get('month') ?? ''}-${parts.get('day') ?? ''}`;
  return {
    calendarDay: `${parts.get('year') ?? ''}-${monthAndDay}`,
    monthAndDay,
    clock:       `${parts.get('hour') ?? ''}:${parts.get('minute') ?? ''}`,
  };
}

/** `13:14` for a stamp of the clock's own day, `11-10 13:14` for one of another day. */
function clockTextOf(stamp: string, nowEpochMilliseconds: number, timeZone: string | undefined): string | null {
  const stampEpochMilliseconds = epochMillisecondsOf(stamp);
  if (stampEpochMilliseconds === null) return null;
  const stampParts = calendarPartsOf(stampEpochMilliseconds, timeZone);
  return stampIsOfTheClocksDay(stamp, nowEpochMilliseconds, timeZone) ? stampParts.clock : `${stampParts.monthAndDay} ${stampParts.clock}`;
}

/** A clock time at a reading of the page's clock; a stamp the forge did not give or that does not parse prints nothing. */
function clockTextAtReadingOf(stamp: string | null, clock: ClockReading): string | null {
  return stamp === null ? null : clockTextOf(stamp, clock.nowEpochMilliseconds, clock.timeZone);
}

/** Whether the stamp falls on the clock's own day in the time zone handed in; a stamp that does not parse falls on no day. */
function stampIsOfTheClocksDay(stamp: string, nowEpochMilliseconds: number, timeZone: string | undefined): boolean {
  const stampEpochMilliseconds = epochMillisecondsOf(stamp);
  if (stampEpochMilliseconds === null) return false;
  return calendarPartsOf(stampEpochMilliseconds, timeZone).calendarDay === calendarPartsOf(nowEpochMilliseconds, timeZone).calendarDay;
}

export const StampTextUtil = {
  ageTextOf,
  clockTextOf,
  clockTextAtReadingOf,
} as const;
