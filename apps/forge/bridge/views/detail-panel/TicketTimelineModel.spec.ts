/**
 * The ticket form's Timeline, on the shapes it draws: a ticket never started (its queue still open, its note naming why it
 * waits), a low ticket without a row, a build paused and resumed and still running, a delivered ticket with a review pass, a delivered
 * ticket missing its `delivered` stamp, whose axis ends at `updated` and never at now, and a ticket abandoned before it started. The end
 * label's clock is local time, so it is asserted through the same formatter, never as a literal.
 */
import { describe, expect, test } from 'bun:test';

import type { DetailTaskDocument, DetailTicketDocument } from '../../@types/DetailBoardState.ts';
import {
  EXAMPLE_DETAIL_FORMAT,
  EXAMPLE_NOW_EPOCH_MILLISECONDS,
  exampleDetailRow,
  exampleDetailTicket,
  exampleStampAt
} from '../../testing/DetailBoardFixture.ts';
import { TimeUtil }                                          from '../../utils/TimeUtil.ts';
import { TicketTimelineModelUtil, type TicketTimelineModel } from './TicketTimelineModel.ts';

interface TimelineShape {
  readonly ticket:      DetailTicketDocument;
  readonly ownRow?:     DetailTaskDocument;
  readonly reviewRows?: readonly DetailTaskDocument[];
  readonly waitingOn?:  readonly string[];
}

function timelineOf({
  ticket, ownRow, reviewRows = [], waitingOn = []
}: TimelineShape): TicketTimelineModel {
  return TicketTimelineModelUtil.ticketTimelineModelOf({
    ticket,
    ownRow:               ownRow ?? null,
    reviewRows,
    waitingOn,
    nowEpochMilliseconds: EXAMPLE_NOW_EPOCH_MILLISECONDS,
    todayCalendarDate:    EXAMPLE_DETAIL_FORMAT.todayCalendarDate,
    limits:               EXAMPLE_DETAIL_FORMAT.limits,
  });
}

function rowsOf(timeline: TicketTimelineModel): string[][] {
  return timeline.rows.map((row) => [row.name, row.monoText ?? '', row.timeText]);
}

function legendOf(timeline: TicketTimelineModel): string[][] {
  return timeline.legend.map((entry) => [entry.label, entry.durationText]);
}

/** A stamp of the example day as the viewer's local clock shows it, which a span's title is written in. */
function localClockOf(clock: string): string {
  return TimeUtil.shortInstantText(Date.parse(exampleStampAt(clock)), EXAMPLE_DETAIL_FORMAT.todayCalendarDate);
}

const NOW_LABEL = `now ${TimeUtil.clockOf(new Date(EXAMPLE_NOW_EPOCH_MILLISECONDS))}`;

describe('a ticket never started', () => {
  const timeline = timelineOf({ ticket: exampleDetailTicket('005'), waitingOn: ['004'] });

  test('shows its open queue to now, a build with no row, and the note naming what it waits on', () => {
    expect(rowsOf(timeline)).toEqual([['Filed', '09:00', 'waiting 4h 36m'], ['Build', '', 'no row']]);
    expect(timeline.note).toBe('Not started: in the queue for 4h 36m. Waiting on #004.');
    expect(timeline.end).toEqual({ closedState: null, label: NOW_LABEL, leftPercent: expect.any(Number) });
    expect(legendOf(timeline)).toEqual([['To do', '4h 36m']]);
  });

  test('a held one says it is held, with its reason', () => {
    expect(timelineOf({ ticket: exampleDetailTicket('005', { hold: 'waiting on the example vendor' }) }).note)
      .toBe('Not started: in the queue for 4h 36m. Held: waiting on the example vendor.');
  });

  test('a low one without a row says it gets one once started', () => {
    expect(timelineOf({ ticket: exampleDetailTicket('007', { priority: 'low' }) }).note)
      .toBe('Not started. Low priority: it gets a build row once it is started, after every normal and high ticket is done.');
  });

  test('one abandoned before it started never had a build row, and ends at its abandonment', () => {
    const abandoned = timelineOf({ ticket: exampleDetailTicket('006', { status: 'abandoned', abandonedAt: exampleStampAt('11:00') }) });
    expect(abandoned.note).toBe('Abandoned before it was started; it never had a build row.');
    expect(abandoned.end.label).toBe('abandoned 11:00');
    expect(rowsOf(abandoned)[0]).toEqual(['Filed', '09:00', 'queued 2h']);
  });
});

describe('a build paused, resumed and still running', () => {
  const ownRow = exampleDetailRow(4, {
    ticket:  '004',
    status:  'in-progress',
    start:   exampleStampAt('10:00'),
    history: [
      { status: 'committed', at: exampleStampAt('09:00') },
      { status: 'in-progress', at: exampleStampAt('10:00') },
      { status: 'paused', at: exampleStampAt('11:00') },
      { status: 'in-progress', at: exampleStampAt('12:00') },
    ],
  });
  const timeline = timelineOf({ ticket: exampleDetailTicket('004', { status: 'in-progress', task: 4 }), ownRow });

  test('draws one segment per build phase, only the last one live, under the row label', () => {
    expect(rowsOf(timeline)).toEqual([['Filed', '09:00', 'queued 1h'], ['Build', '#004', '3h 36m']]);
    const build = timeline.rows[1]?.bars ?? [];
    expect(build.map((bar) => [bar.kind, bar.state, bar.isLive])).toEqual([
      ['build', 'in-progress', false],
      ['build', 'paused', false],
      ['build', 'in-progress', true],
    ]);
    expect(build[2]?.title).toBe(`In progress ${localClockOf('12:00')} → now · 1h 36m`);
  });

  test('sums the time in each state, the queue first, and needs no note', () => {
    expect(legendOf(timeline)).toEqual([['To do', '1h'], ['In progress', '2h 36m'], ['Paused', '1h']]);
    expect(timeline.note).toBeNull();
  });

  test('places every bar inside the axis', () => {
    for (const bar of timeline.rows.flatMap((row) => row.bars)) {
      expect(bar.leftPercent).toBeGreaterThanOrEqual(0);
      expect(bar.leftPercent + bar.widthPercent).toBeLessThanOrEqual(100);
    }
  });
});

describe('a delivered ticket with a review pass', () => {
  const ownRow = exampleDetailRow(8, {
    ticket:   '008',
    status:   'delivered',
    start:    exampleStampAt('09:30'),
    end:      exampleStampAt('10:30'),
    reviewed: exampleStampAt('11:40'),
    history:  [
      { status: 'in-progress', at: exampleStampAt('09:30') },
      { status: 'in-review', at: exampleStampAt('10:30') },
      { status: 'reviewed', at: exampleStampAt('11:40') },
      { status: 'delivered', at: exampleStampAt('12:00') },
    ],
  });
  const review = exampleDetailRow(9, {
    reviewOf: '008', status: 'delivered', start: exampleStampAt('11:00'), end: exampleStampAt('11:40'), tokens: 1200000
  });
  const ticket = exampleDetailTicket('008', {
    status: 'delivered', task: 8, finished: exampleStampAt('10:30'), delivered: exampleStampAt('12:00')
  });
  const timeline = timelineOf({ ticket, ownRow, reviewRows: [review] });

  test('draws the review pass on a row of its own and the waits after the build in one lifecycle row', () => {
    expect(rowsOf(timeline)).toEqual([
      ['Filed', '09:00', 'queued 30m'],
      ['Build', '#008', '1h'],
      ['Review 1', '', '40m'],
      ['After build', '', '1h 30m'],
    ]);
    expect(timeline.rows[2]?.bars[0]?.title).toBe(`Review 1 ${localClockOf('11:00')}–${localClockOf('11:40')} · 40m · 1.2M tokens`);
    expect(timeline.rows[3]?.bars.map((bar) => [bar.state, bar.label])).toEqual([
      ['in-review', 'Awaiting review'],
      ['reviewing', 'Reviewing'],
      ['reviewed', 'Awaiting merge'],
    ]);
  });

  test('ends at its delivery, in the closing word, with nothing live', () => {
    expect(timeline.end).toEqual({ closedState: 'delivered', label: 'done 12:00', leftPercent: expect.any(Number) });
    expect(timeline.rows.flatMap((row) => row.bars).some((bar) => bar.isLive)).toBe(false);
    expect(legendOf(timeline)).toEqual([
      ['To do', '30m'],
      ['In progress', '1h'],
      ['Awaiting review', '30m'],
      ['Reviewing', '40m'],
      ['Awaiting merge', '20m'],
    ]);
  });

  test('missing its delivered stamp, it ends at updated and never at now', () => {
    const unstamped = timelineOf({ ticket: { ...ticket, delivered: null, updated: exampleStampAt('12:30') }, ownRow, reviewRows: [review] });
    expect(unstamped.end.label).toBe('done 12:30');
  });
});

test('the filed name keeps the stamp in a title when it is not from the viewer\'s day', () => {
  const timeline = timelineOf({ ticket: exampleDetailTicket('005', { filed: exampleStampAt('09:00', '2026-09-17') }) });
  expect([timeline.rows[0]?.monoText, timeline.rows[0]?.nameTitle]).toEqual([null, 'filed 2026-09-17 09:00']);
});
