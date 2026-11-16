/**
 * Today's figures. What matters: a ticket counts as delivered today only when its stamp's calendar date is today's, sliced as written; the
 * tokens count every row still running and every row that ended today, never one that ended on another day; a board without a page has none.
 * Flint's brain adds the running run's tokens and those of the runs that ended today, its UTC stamps read as local time; a run both logged
 * and still in the live reading counts once, as logged.
 */
import { describe, expect, test } from 'bun:test';

import type { MonitorFlintBrainDocument } from 'forge-contracts/MonitorSnapshotDocument';

import { LocalTimeUtil }    from '../../lib/local-time/LocalTimeUtil.ts';
import type { LogRecord }   from '../../lib/tracker-model/@types/LogRecord.ts';
import { TIMESTAMP_SLICES } from '../constants/TimestampSlices.ts';
import {
  flintBrainRunsOf,
  todayFiguresOf,
  type TodayFiguresBoard,
  type TodayFlintBrainRun
} from './TodayFigures.ts';

const TODAY = '2026-11-12';

const BOARD: TodayFiguresBoard = {
  page: {
    tickets: [{ delivered: '2026-11-12T09:00:00+01:00' }, { delivered: '2026-11-11T23:59:00+01:00' }, { delivered: null }],
    payload: {
      progress: {
        tasks: [
          { status: 'in-progress', end: null, tokens: 1000 },
          { status: 'done', end: '2026-11-12T08:00:00+01:00', tokens: 200 },
          { status: 'done', end: '2026-11-11T08:00:00+01:00', tokens: 30 },
          { status: 'done', end: '2026-11-12T10:00:00+01:00' },
        ],
      },
    },
  },
};

describe('todayFiguresOf', () => {
  test('counts the tickets delivered today and the tokens of the rows running or ended today', () => {
    expect(todayFiguresOf(BOARD, TODAY)).toEqual({ deliveredTickets: 1, tokens: 1200 });
  });

  test('a board without a page has delivered nothing and spent nothing', () => {
    expect(todayFiguresOf({}, TODAY)).toEqual({ deliveredTickets: 0, tokens: 0 });
  });
});

/** A stamp in UTC whose local calendar date, on the machine the spec runs on, is the given local moment's. */
function utcStampOf(year: number, monthIndex: number, day: number, hour: number): string {
  return new Date(year, monthIndex, day, hour, 0, 0).toISOString();
}

const LOCAL_TODAY = LocalTimeUtil.formatLocalIso(new Date(2026, 10, 12, 12, 0, 0)).slice(0, TIMESTAMP_SLICES.CALENDAR_DATE_LENGTH_CHARACTERS);

function endedRecordOf(startedAt: string, endedAt: string, tokens: number): LogRecord {
  return {
    kind:   'flint-brain-ended',
    at:     endedAt,
    fields: {
      startedBy: 'api', startedAt, endedAt, endedReason: 'stopped', tokens, calls: 2
    }
  };
}

const RUNNING_READING = {
  state: 'running', startedAt: utcStampOf(2026, 10, 12, 11), endedAt: null, tokens: 700
} as unknown as MonitorFlintBrainDocument;

describe('todayFiguresOf with Flint\'s brain', () => {
  test('adds the running run\'s tokens and those of the runs that ended today, never of a run that ended another day', () => {
    const runs: TodayFlintBrainRun[] = [
      { startedAt: utcStampOf(2026, 10, 12, 8), endedAt: utcStampOf(2026, 10, 12, 9), tokens: 50 },
      { startedAt: utcStampOf(2026, 10, 11, 8), endedAt: utcStampOf(2026, 10, 11, 9), tokens: 4000 },
      { startedAt: utcStampOf(2026, 10, 12, 11), endedAt: null, tokens: 700 },
    ];
    expect(todayFiguresOf({}, LOCAL_TODAY, runs)).toEqual({ deliveredTickets: 0, tokens: 750 });
  });
});

describe('flintBrainRunsOf', () => {
  test('holds every logged run, then the live reading\'s run', () => {
    const logged = endedRecordOf(utcStampOf(2026, 10, 12, 8), utcStampOf(2026, 10, 12, 9), 50);
    expect(flintBrainRunsOf([logged], RUNNING_READING)).toEqual([
      { startedAt: utcStampOf(2026, 10, 12, 8), endedAt: utcStampOf(2026, 10, 12, 9), tokens: 50 },
      { startedAt: utcStampOf(2026, 10, 12, 11), endedAt: null, tokens: 700 },
    ]);
  });

  test('counts a run the log holds and the reading still shows ended once, as logged', () => {
    const endedAt = utcStampOf(2026, 10, 12, 11);
    const endedReading = {
      ...RUNNING_READING, state: 'ended', endedAt, tokens: 700
    } as MonitorFlintBrainDocument;
    const logged = endedRecordOf(RUNNING_READING.startedAt ?? '', endedAt, 700);
    expect(flintBrainRunsOf([logged], endedReading)).toEqual([{ startedAt: RUNNING_READING.startedAt ?? '', endedAt, tokens: 700 }]);
    expect(todayFiguresOf({}, LOCAL_TODAY, flintBrainRunsOf([logged], endedReading)).tokens).toBe(700);
  });

  test('holds no live run for a brain that is off or refused, or a forge without one', () => {
    const offReading = {
      state: 'off', startedAt: null, endedAt: null, tokens: null
    } as unknown as MonitorFlintBrainDocument;
    expect([flintBrainRunsOf([], offReading), flintBrainRunsOf([], null)]).toEqual([[], []]);
  });
});
