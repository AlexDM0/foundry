/**
 * Today's figures the header shows: the tickets delivered today and the tokens of the rows running or ended today. Today is a local
 * calendar date the caller names, and a board's stamp is sliced, never parsed, so its date is compared as the machine that recorded it
 * wrote it.
 */
import { LocalTimeUtil }    from '../../lib/local-time/LocalTimeUtil.ts';
import { TIMESTAMP_SLICES } from '../constants/TimestampSlices.ts';

/** The board fields the figures read; the Overseer's state and the served board document both fit. */
export interface TodayFiguresBoard {
  readonly page?: {
    readonly tickets: readonly { readonly delivered: string | null }[];
    readonly payload: { readonly progress: { readonly tasks: readonly TodayFiguresTask[] } };
  };
}

interface TodayFiguresTask {
  readonly status:  string;
  readonly end:     string | null;
  readonly tokens?: number | null;
}

export interface TodayFigures {
  readonly deliveredTickets: number;
  readonly tokens:           number;
}

const RUNNING_STATUS = 'in-progress';

/** The machine's local calendar date at `now`, `2026-11-20`, the day the figures count. */
export function todayCalendarDateOf(now: Date): string {
  return LocalTimeUtil.formatLocalIso(now).slice(0, TIMESTAMP_SLICES.CALENDAR_DATE_LENGTH_CHARACTERS);
}

export function todayFiguresOf(board: TodayFiguresBoard, todayCalendarDate: string): TodayFigures {
  const tasks = board.page?.payload.progress.tasks ?? [];
  const tickets = board.page?.tickets ?? [];
  const isToday = (stamp: string | null): boolean => stamp !== null && stamp.slice(0, TIMESTAMP_SLICES.CALENDAR_DATE_LENGTH_CHARACTERS) === todayCalendarDate;
  const countsToday = (task: TodayFiguresTask): boolean => (task.status === RUNNING_STATUS && task.end === null) || isToday(task.end);
  return {
    deliveredTickets: tickets.filter((ticket) => isToday(ticket.delivered)).length,
    tokens:           tasks.filter(countsToday).reduce((total, row) => total + (row.tokens ?? 0), 0),
  };
}
