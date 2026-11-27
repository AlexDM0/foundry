/**
 * The one formatter every stamp on the page goes through: a stamp from the viewer's day shows only its clock, one from another day of the
 * same year gains its month and day, and one from another year is shown in full. Nothing here reads the clock; "today" is handed in, and
 * comparing a stamp or instant with the viewer's day is a stated clock exception that decides only the text printed. It also formats
 * durations and parses stamps.
 */

import type { BoardDocument }      from '../../@types/board/BoardDocument.ts';
import { MILLISECONDS_PER_MINUTE } from '../../shared/constants/TimeUnits.ts';

const SHORTEST_NAMED_DURATION = 'under a minute';

/** The board's `limits` fields a stamp is cut by, named here so a stamp needs none of the board's other fields. */
export interface TimestampSlices {
  readonly dateAndClockLength:    number;
  readonly calendarDateLength:    number;
  readonly monthAndDaySliceStart: number;
  readonly clockSliceStart:       number;
  readonly clockSliceEnd:         number;
}

export interface DurationUnits {
  readonly hourMinutes: number;
  readonly dayMinutes:  number;
}

function padToTwoDigits(value: number): string {
  return String(value).padStart(2, '0');
}

function clockOf(moment: Date): string {
  return `${padToTwoDigits(moment.getHours())}:${padToTwoDigits(moment.getMinutes())}`;
}

function monthAndDayOf(moment: Date): string {
  return `${padToTwoDigits(moment.getMonth() + 1)}-${padToTwoDigits(moment.getDate())}`;
}

function yearOf(calendarDate: string): string {
  return calendarDate.split('-', 1)[0] ?? '';
}

function calendarDateOf(epochMilliseconds: number): string {
  const moment = new Date(epochMilliseconds);
  return `${moment.getFullYear()}-${monthAndDayOf(moment)}`;
}

function fullStampText(stamp: string, slices: TimestampSlices): string {
  return stamp.slice(0, slices.dateAndClockLength).replace('T', ' ');
}

/** Sliced, never parsed: the stamp keeps the wall clock and the offset of the machine that recorded it, so its date is compared as written. */
function stampIsFromDay(stamp: string, calendarDate: string, slices: TimestampSlices): boolean {
  return stamp.slice(0, slices.calendarDateLength) === calendarDate;
}

function shortStampText(stamp: string, todayCalendarDate: string, slices: TimestampSlices): string {
  if (stampIsFromDay(stamp, todayCalendarDate, slices)) {
    return stamp.slice(slices.clockSliceStart, slices.clockSliceEnd);
  }
  if (stamp.slice(0, slices.monthAndDaySliceStart) === todayCalendarDate.slice(0, slices.monthAndDaySliceStart)) {
    return stamp.slice(slices.monthAndDaySliceStart, slices.clockSliceEnd).replace('T', ' ');
  }
  return fullStampText(stamp, slices);
}

function fullInstantText(epochMilliseconds: number): string {
  return `${calendarDateOf(epochMilliseconds)} ${clockOf(new Date(epochMilliseconds))}`;
}

function shortInstantText(epochMilliseconds: number, todayCalendarDate: string): string {
  const moment       = new Date(epochMilliseconds);
  const calendarDate = calendarDateOf(epochMilliseconds);
  if (calendarDate === todayCalendarDate) {
    return clockOf(moment);
  }
  if (yearOf(calendarDate) === yearOf(todayCalendarDate)) {
    return monthDayAndClockText(epochMilliseconds);
  }
  return fullInstantText(epochMilliseconds);
}

/**
 * `shortInstantText` with seconds, for a chat whose lines come seconds apart. A Talos stamp is UTC and has no wall clock of its own to
 * keep, so it is parsed and shown in the viewer's local time, unlike a board stamp, which is sliced.
 */
function secondsClockText(epochMilliseconds: number, todayCalendarDate: string): string {
  const moment       = new Date(epochMilliseconds);
  const calendarDate = calendarDateOf(epochMilliseconds);
  const clock        = `${clockOf(moment)}:${padToTwoDigits(moment.getSeconds())}`;
  if (calendarDate === todayCalendarDate) {
    return clock;
  }
  if (yearOf(calendarDate) === yearOf(todayCalendarDate)) {
    return `${monthAndDayOf(moment)} ${clock}`;
  }
  return `${calendarDate} ${clock}`;
}

function monthDayAndClockText(epochMilliseconds: number): string {
  const moment = new Date(epochMilliseconds);
  return `${monthAndDayOf(moment)} ${clockOf(moment)}`;
}

/** Null for a span that runs backwards, which a backfilled `--at` can write: it is no duration, not a short one. */
function formatDuration(milliseconds: number, units: DurationUnits): string | null {
  if (milliseconds < 0) {
    return null;
  }
  const totalMinutes = Math.floor(milliseconds / MILLISECONDS_PER_MINUTE);
  if (totalMinutes < 1) {
    return SHORTEST_NAMED_DURATION;
  }
  const days    = Math.floor(totalMinutes / units.dayMinutes);
  const hours   = Math.floor((totalMinutes % units.dayMinutes) / units.hourMinutes);
  const minutes = totalMinutes % units.hourMinutes;
  if (days > 0) {
    return hours === 0 ? `${days}d` : `${days}d ${hours}h`;
  }
  if (hours > 0) {
    return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

/** Instants the tool wrote are sliced for display; a span between two of them has no wall clock to preserve, so it is parsed and formatted. */
function epochMillisecondsOf(stamp: string | null | undefined): number | null {
  if (stamp === null || stamp === undefined || stamp === '') {
    return null;
  }
  const parsed = Date.parse(stamp);
  return Number.isNaN(parsed) ? null : parsed;
}

/** The board's stamp slices, which every stamp is sliced by. */
function timestampSlicesOf(board: Pick<BoardDocument, 'limits'>): TimestampSlices {
  const {
    dateAndClockLength, calendarDateLength, monthAndDaySliceStart, clockSliceStart, clockSliceEnd
  } = board.limits;
  return {
    dateAndClockLength, calendarDateLength, monthAndDaySliceStart, clockSliceStart, clockSliceEnd
  };
}

export const TimeUtil = {
  calendarDateOf,
  clockOf,
  monthAndDayOf,
  fullStampText,
  stampIsFromDay,
  shortStampText,
  fullInstantText,
  shortInstantText,
  secondsClockText,
  monthDayAndClockText,
  formatDuration,
  epochMillisecondsOf,
  timestampSlicesOf,
} as const;
