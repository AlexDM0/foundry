/**
 * Today's figures the header shows: the tickets delivered today and the tokens of the rows running or ended today, Flint's brain's runs
 * among them. Today is a local calendar date the caller names, and a board's stamp is sliced, never parsed, so its date is compared as the
 * machine that recorded it wrote it.
 */
import type { MonitorFlintBrainDocument } from 'forge-contracts/MonitorSnapshotDocument';

import { LocalTimeUtil }    from '../../lib/local-time/LocalTimeUtil.ts';
import type { LogRecord }   from '../../lib/tracker-model/@types/LogRecord.ts';
import { TIMESTAMP_SLICES } from '../constants/TimestampSlices.ts';

/** The board fields the figures read; the Overseer's state and the Bridge's board document both fit. */
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

/** One run of Flint's brain, running while `endedAt` is `null`; its start names it, so the log and the live reading count it once. */
export interface TodayFlintBrainRun {
  readonly startedAt: string;
  readonly endedAt:   string | null;
  readonly tokens:    number;
}

export interface TodayFigures {
  readonly deliveredTickets: number;
  readonly tokens:           number;
}

const RUNNING_STATUS = 'in-progress';

/** Every run the log holds as ended, then the live reading's run unless the log already holds it: one starting, running, or just ended. */
export function flintBrainRunsOf(logRecords: readonly LogRecord[], reading: MonitorFlintBrainDocument | null): TodayFlintBrainRun[] {
  const runs: TodayFlintBrainRun[] = logRecords.flatMap((record) => (record.kind === 'flint-brain-ended'
    ? [{ startedAt: record.fields.startedAt, endedAt: record.fields.endedAt, tokens: record.fields.tokens }]
    : []));
  const liveStartedAt = reading?.startedAt ?? null;
  if (reading === null || liveStartedAt === null || runs.some((run) => run.startedAt === liveStartedAt)) return runs;
  return [...runs, { startedAt: liveStartedAt, endedAt: reading.endedAt, tokens: reading.tokens ?? 0 }];
}

/** The machine's local calendar date at `now`, `2026-11-20`, the day the figures count. */
export function todayCalendarDateOf(now: Date): string {
  return LocalTimeUtil.formatLocalIso(now).slice(0, TIMESTAMP_SLICES.CALENDAR_DATE_LENGTH_CHARACTERS);
}

export function todayFiguresOf(board: TodayFiguresBoard, todayCalendarDate: string, flintBrainRuns: readonly TodayFlintBrainRun[] = []): TodayFigures {
  const tasks = board.page?.payload.progress.tasks ?? [];
  const tickets = board.page?.tickets ?? [];
  const isToday = (stamp: string | null): boolean => stamp !== null && stamp.slice(0, TIMESTAMP_SLICES.CALENDAR_DATE_LENGTH_CHARACTERS) === todayCalendarDate;
  const countsToday = (task: TodayFiguresTask): boolean => (task.status === RUNNING_STATUS && task.end === null) || isToday(task.end);
  // The brain stamps its runs in UTC, so its end is read as this machine's local time before its date is sliced.
  const runCountsToday = (run: TodayFlintBrainRun): boolean => run.endedAt === null || isToday(LocalTimeUtil.formatLocalIso(new Date(run.endedAt)));
  return {
    deliveredTickets: tickets.filter((ticket) => isToday(ticket.delivered)).length,
    tokens:           [...tasks.filter(countsToday), ...flintBrainRuns.filter(runCountsToday)].reduce((total, row) => total + (row.tokens ?? 0), 0),
  };
}
