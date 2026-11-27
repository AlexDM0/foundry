/**
 * The words a Kanban card prints beyond its title: the working label and time, the review round the forge serves, how long a paused or
 * waiting card has waited, the newest milestone otherwise, and the note on a reviewed or abandoned ticket.
 */
import { describe, expect, test } from 'bun:test';

import type { BoardTaskDocument, BoardTicketDocument }   from '../../../@types/board/BoardTicketDocuments.ts';
import type { BoardDisplayState }                        from '../../../@types/board/BoardVocabulary.ts';
import { exampleTask }                                   from '../../testing/BoardStateFixture.ts';
import { EXAMPLE_NOW_EPOCH_MILLISECONDS, exampleTicket } from '../../testing/KanbanBoardFixture.ts';
import { EXAMPLE_BOARD_LIMITS }                          from '../../testing/PageLimitsFixture.ts';
import { TimeUtil }                                      from '../../utils/TimeUtil.ts';
import type { KanbanCardTextFormat }                     from './KanbanCardTextUtil.ts';
import { KanbanCardTextUtil }                            from './KanbanCardTextUtil.ts';

const FORMAT: KanbanCardTextFormat = {
  nowEpochMilliseconds: EXAMPLE_NOW_EPOCH_MILLISECONDS,
  todayCalendarDate:    TimeUtil.calendarDateOf(EXAMPLE_NOW_EPOCH_MILLISECONDS),
  limits:               EXAMPLE_BOARD_LIMITS,
};

const MILLISECONDS_PER_MINUTE = 60_000;

function stampMinutesAgo(minutes: number): string {
  return new Date(EXAMPLE_NOW_EPOCH_MILLISECONDS - minutes * MILLISECONDS_PER_MINUTE).toISOString();
}

function row(fields: Partial<BoardTaskDocument> = {}): BoardTaskDocument {
  return exampleTask({
    id: 1, name: '#010', status: 'in-progress', ...fields
  });
}

interface SourceFields {
  readonly ticket?:     BoardTicketDocument;
  readonly ownRow?:     BoardTaskDocument | null;
  readonly reviewRows?: readonly BoardTaskDocument[];
}

function sourceOf(displayState: BoardDisplayState, fields: SourceFields = {}) {
  return {
    ticket: fields.ticket ?? exampleTicket('010'), displayState, ownRow: fields.ownRow ?? null, reviewRows: fields.reviewRows ?? []
  };
}

describe('a working card\'s stamp', () => {
  test('a build ticks "building" and its time at work from its row\'s start', () => {
    const stamp = KanbanCardTextUtil.cardStampOf(sourceOf('in-progress', { ownRow: row({ start: stampMinutesAgo(156) }) }), FORMAT, false);
    expect(stamp).toEqual({ shortText: 'building 2h 36m 00s', fullText: 'building 2h 36m 00s', ticks: true });
  });

  test('a review ticks from its newest review row while that row runs, and a repeat review names its round', () => {
    const reviewRows = [row({ start: stampMinutesAgo(90), end: stampMinutesAgo(80) }), row({ start: stampMinutesAgo(31) })];
    expect(KanbanCardTextUtil.cardStampOf(sourceOf('reviewing', { reviewRows }), FORMAT, false)?.shortText).toBe('reviewing 31m 00s');
    const thirdRound = exampleTicket('010', { facts: { ...exampleTicket('010').facts, reviewRound: 3, isRepeatReview: true } });
    expect(KanbanCardTextUtil.cardStampOf(sourceOf('re-review', { reviewRows, ticket: thirdRound }), FORMAT, false)?.shortText).toBe('3rd round 31m 00s');
    expect(KanbanCardTextUtil.cardStampOf(sourceOf('re-review', { reviewRows }), FORMAT, false)?.shortText).toBe('2nd round 31m 00s');
  });

  test('a review whose newest row ended falls back to the newest milestone', () => {
    const reviewRows = [row({ start: stampMinutesAgo(90), end: stampMinutesAgo(80) })];
    expect(KanbanCardTextUtil.cardStampOf(sourceOf('reviewing', { reviewRows }), FORMAT, false)?.shortText).toBe('filed 10-01 09:00');
  });
});

describe('a waiting card\'s stamp', () => {
  test('a paused build says how long since its newest pause, the full stamp in the hover', () => {
    const pausedAt = '2026-10-10T10:09:00+02:00';
    const ownRow = row({ history: [{ status: 'paused', at: '2026-10-10T08:00:00+02:00' }, { status: 'paused', at: pausedAt }] });
    const fullText = `paused since ${TimeUtil.fullStampText(pausedAt, EXAMPLE_BOARD_LIMITS)}`;
    expect(KanbanCardTextUtil.cardStampOf(sourceOf('paused', { ownRow }), FORMAT, false)).toEqual({ shortText: 'paused 1h 51m', fullText, ticks: false });
  });

  test('an awaiting-review card says how long it has waited since it went in review', () => {
    const ownRow = row({ history: [{ status: 'in-review', at: stampMinutesAgo(16) }] });
    expect(KanbanCardTextUtil.cardStampOf(sourceOf('in-review', { ownRow }), FORMAT, false)?.shortText).toBe('waiting 16m');
  });

  test('a wait stamped later than now shows the newest milestone instead', () => {
    const ownRow = row({ history: [{ status: 'paused', at: stampMinutesAgo(-5) }] });
    expect(KanbanCardTextUtil.cardStampOf(sourceOf('paused', { ownRow }), FORMAT, false)?.shortText).toBe('filed 10-01 09:00');
  });
});

describe('the newest milestone', () => {
  const builtTicket = exampleTicket('020', { started: '2026-10-09T08:00:00+02:00', finished: '2026-10-10T09:30:00+02:00' });

  test('a finished build reads "built" in the merge queue and "finished" elsewhere, short against today, in full in the hover', () => {
    const fullText = `built ${TimeUtil.fullStampText('2026-10-10T09:30:00+02:00', EXAMPLE_BOARD_LIMITS)}`;
    expect(KanbanCardTextUtil.cardStampOf(sourceOf('reviewed', { ticket: builtTicket }), FORMAT, true)).toEqual({ shortText: 'built 09:30', fullText, ticks: false });
    expect(KanbanCardTextUtil.cardStampOf(sourceOf('reviewed', { ticket: builtTicket }), FORMAT, false)?.shortText).toBe('finished 09:30');
  });

  test('a delivery reads "done" and an abandonment "abandoned", each before any other milestone', () => {
    const delivered = exampleTicket('021', { finished: '2026-10-09T08:00:00+02:00', delivered: '2026-10-09T09:00:00+02:00' });
    const abandoned = exampleTicket('022', { abandonedAt: '2026-10-08T09:00:00+02:00' });
    expect(KanbanCardTextUtil.cardStampOf(sourceOf('delivered', { ticket: delivered }), FORMAT, false)?.shortText).toBe('done 10-09 09:00');
    expect(KanbanCardTextUtil.cardStampOf(sourceOf('abandoned', { ticket: abandoned }), FORMAT, false)?.shortText).toBe('abandoned 10-08 09:00');
  });
});

describe('the note and the reviewed mark', () => {
  test('a reviewed ticket notes when it was reviewed, an abandoned one why, and any other card nothing', () => {
    const reviewed = sourceOf('reviewed', { ownRow: row({ reviewed: '2026-10-09T13:28:00+02:00' }) });
    const abandoned = sourceOf('abandoned', { ticket: exampleTicket('030', { reason: 'Example vendor dropped the feature' }) });
    expect(KanbanCardTextUtil.cardNoteOf(reviewed, FORMAT)).toBe('reviewed 10-09 13:28');
    expect(KanbanCardTextUtil.cardNoteOf(abandoned, FORMAT)).toBe('Example vendor dropped the feature');
    expect(KanbanCardTextUtil.cardNoteOf(sourceOf('abandoned'), FORMAT)).toBeNull();
    expect(KanbanCardTextUtil.cardNoteOf(sourceOf('committed'), FORMAT)).toBeNull();
  });

  test('the reviewed mark\'s hover names the review stamp in full, or only that it was reviewed', () => {
    expect(KanbanCardTextUtil.reviewedTitleOf({ reviewed: '2026-10-09T13:28:00+02:00' }, FORMAT))
      .toBe(`Reviewed ${TimeUtil.fullStampText('2026-10-09T13:28:00+02:00', EXAMPLE_BOARD_LIMITS)} before it was done`);
    expect(KanbanCardTextUtil.reviewedTitleOf({ reviewed: null }, FORMAT)).toBe('Reviewed before it was done');
  });
});
