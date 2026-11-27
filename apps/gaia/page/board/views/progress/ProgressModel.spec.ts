/**
 * The Progress chart's model: bar placement and clipping, review rows known from the board's row facts alone and ordered by round, review segments,
 * and which rows count as changed.
 */
import { describe, expect, test } from 'bun:test';

import { exampleProgressBoard, exampleProgressTask, exampleProgressTicket } from '../../testing/ProgressBoardFixture.ts';
import { ProgressModel, type ProgressChartChoices }                         from './ProgressModel.ts';
import { EMPTY_VIEW_OVERRIDE }                                              from './utils/ChartPreferenceUtil.ts';
import { RangePresetUtil }                                                  from './utils/RangePresetUtil.ts';

const NOW_EPOCH_MILLISECONDS = Date.parse('2026-09-18T13:00:00+02:00');

const CHOICES: ProgressChartChoices = {
  override:                EMPTY_VIEW_OVERRIDE,
  reviewRowsAreShown:      false,
  nowEpochMilliseconds:    NOW_EPOCH_MILLISECONDS,
  todayCalendarDate:       '2026-09-18',
  cutoffEpochMilliseconds: Number.NEGATIVE_INFINITY,
};

const ABSOLUTE_VIEW = {
  kind: 'absolute', from: '2026-09-18T09:00:00+02:00', to: '2026-09-18T13:00:00+02:00', tickMinutes: null
} as const;

const BUILD_ROW = exampleProgressTask(1, {
  name: '#5 Build the example', status: 'delivered', ticket: '5', start: '2026-09-18T09:00:00+02:00', end: '2026-09-18T11:00:00+02:00'
});

function reviewTask(id: number, name: string, start: string, end: string | null) {
  return exampleProgressTask(id, {
    name, status: end === null ? 'in-progress' : 'delivered', reviewOf: '5', start, end
  });
}

function reviewedBoard(firstName: string, secondName: string) {
  return exampleProgressBoard({
    view:  ABSOLUTE_VIEW,
    tasks: [
      BUILD_ROW,
      reviewTask(2, firstName, '2026-09-18T11:00:00+02:00', '2026-09-18T11:30:00+02:00'),
      reviewTask(3, secondName, '2026-09-18T11:40:00+02:00', null),
      reviewTask(4, 'Review 3 #5 — named like a review, but the Board names no ticket row', '2026-09-18T12:00:00+02:00', null),
    ],
    rowFacts:   { 1: { displayState: 'reviewing' }, 2: { reviewsTaskId: 1 }, 3: { reviewsTaskId: 1, displayState: 're-review' } },
    tickets:    [exampleProgressTicket('5', { status: 'in-review' })],
    ticketRows: { 5: { ownTaskId: 1, reviewTaskIds: [2, 3] } },
  });
}

describe('bar placement', () => {
  test('places a row’s bar as percentages of the range and its label from its ticket', () => {
    const chart = ProgressModel.progressChartOf(exampleProgressBoard({ view: ABSOLUTE_VIEW, tasks: [BUILD_ROW] }), CHOICES);
    const [row] = chart.rows;

    expect(row?.bars.map((bar) => [bar.leftPercent, bar.widthPercent, bar.isHidden])).toEqual([[0, 50, false]]);
    expect(row?.labelText).toBe('#5');
    expect(row?.linkedTicketId).toBe('5');
    expect(row?.nameText).toBe('Build the example');
    expect(chart.ticks.length).toBeGreaterThan(1);
    expect(chart.nowPercent).toBe(100);
  });

  test('clips a bar that runs off the range on the edge it runs off', () => {
    const view = {
      kind: 'absolute', from: '2026-09-18T10:00:00+02:00', to: '2026-09-18T13:00:00+02:00', tickMinutes: null
    } as const;
    const [row] = ProgressModel.progressChartOf(exampleProgressBoard({ view, tasks: [BUILD_ROW] }), CHOICES).rows;

    expect([row?.clippedLeft, row?.clippedRight]).toEqual([true, false]);
  });

  test('hides the bar of a task that never started', () => {
    const [row] = ProgressModel.progressChartOf(exampleProgressBoard({ tasks: [exampleProgressTask(1)] }), CHOICES).rows;

    expect(row?.bars.map((bar) => bar.isHidden)).toEqual([true]);
    expect(row?.labelText).toBe('TASK');
  });

  test('fits the range from the earliest start to now, with the margin on both ends', () => {
    const chart = ProgressModel.progressChartOf(exampleProgressBoard({ tasks: [BUILD_ROW] }), CHOICES);
    const [bar] = chart.rows[0]?.bars ?? [];

    expect(bar?.leftPercent).toBeGreaterThan(0);
    expect(chart.nowPercent).toBeLessThan(100);
    expect(chart.rangeNoteText).toContain('ticks');
  });

  test('a preset holds its own span, so a row older than it runs off its left edge where Fit shows it whole', () => {
    const board = exampleProgressBoard({ tasks: [BUILD_ROW] });

    expect(ProgressModel.progressChartOf(board, { ...CHOICES, override: RangePresetUtil.overrideOfPreset('1h', EMPTY_VIEW_OVERRIDE) }).rows[0]?.clippedLeft).toBe(true);
    expect(ProgressModel.progressChartOf(board, CHOICES).rows[0]?.clippedLeft).toBe(false);
  });

  test('typed bounds are drawn with the chosen tick size, and Custom is pressed', () => {
    const board = exampleProgressBoard({ tasks: [BUILD_ROW] });
    const chart = ProgressModel.progressChartOf(board, {
      ...CHOICES,
      override: {
        presetKey: null, fromText: '2026-09-18T10:00:00+02:00', toText: 'now', tickMinutes: 15
      },
    });

    expect(chart.fromEpochMilliseconds).toBe(Date.parse('2026-09-18T10:00:00+02:00'));
    expect(chart.toEpochMilliseconds).toBe(NOW_EPOCH_MILLISECONDS);
    expect(chart.rangeNoteText).toContain('15m ticks');
    expect(chart.pressedPreset).toBe('custom');
    expect(chart.modeLabel).toBe('Custom');
  });

  test('a tick size alone keeps the tracker\'s own range and draws it with that size', () => {
    const board = exampleProgressBoard({ tasks: [BUILD_ROW], view: ABSOLUTE_VIEW });
    const chart = ProgressModel.progressChartOf(board, { ...CHOICES, override: { ...EMPTY_VIEW_OVERRIDE, tickMinutes: 60 } });

    expect(chart.fromEpochMilliseconds).toBe(Date.parse(ABSOLUTE_VIEW.from));
    expect(chart.rangeNoteText).toContain('1h ticks');
    expect(chart.pressedPreset).toBe('fit');
  });

  test('resolves a typed bound as the axis reads it, and an unreadable one as null', () => {
    const board = exampleProgressBoard({ tasks: [BUILD_ROW] });

    expect(ProgressModel.rangeBoundOf(board, 'start', NOW_EPOCH_MILLISECONDS, Number.NEGATIVE_INFINITY)).toBe(Date.parse('2026-09-18T09:00:00+02:00'));
    expect(ProgressModel.rangeBoundOf(board, '-2h', NOW_EPOCH_MILLISECONDS, Number.NEGATIVE_INFINITY)).toBe(NOW_EPOCH_MILLISECONDS - 2 * 60 * 60 * 1000);
    expect(ProgressModel.rangeBoundOf(board, '-2x', NOW_EPOCH_MILLISECONDS, Number.NEGATIVE_INFINITY)).toBeNull();
  });
});

describe('the range control', () => {
  test('Fit follows the rows and names its ends; a preset holds the range in the held title', () => {
    const board = exampleProgressBoard({ view: ABSOLUTE_VIEW, tasks: [BUILD_ROW] });
    const fitted = ProgressModel.progressChartOf(board, CHOICES);
    const held = ProgressModel.progressChartOf(board, { ...CHOICES, override: RangePresetUtil.overrideOfPreset('4h', EMPTY_VIEW_OVERRIDE) });

    expect([fitted.modeLabel, fitted.modeIsHeld]).toEqual(['Fit', false]);
    expect(fitted.rangeNoteText).toMatch(/^\d\d:\d\d → \d\d:\d\d · /);
    expect(fitted.modeTitle).toStartWith('Fitted to the rows shown');
    expect([held.modeLabel, held.modeIsHeld]).toEqual(['4h', true]);
    expect(held.modeTitle).toStartWith('Held: ');
    expect(held.rangeNoteTitle).toStartWith('4h · ');
  });
});

describe('the finished-work window', () => {
  const OLD_ROW = exampleProgressTask(1, {
    name: 'Old work', status: 'delivered', start: '2026-09-17T08:00:00+02:00', end: '2026-09-17T09:00:00+02:00'
  });
  const RECENT_ROW = exampleProgressTask(2, {
    name: 'Recent work', status: 'delivered', start: '2026-09-18T10:00:00+02:00', end: '2026-09-18T11:00:00+02:00'
  });
  const OPEN_ROW = exampleProgressTask(3, { name: 'Open work', status: 'committed' });

  test('drops a row that finished before the window, keeps open rows, and fits the range to the rows drawn', () => {
    const board = exampleProgressBoard({ tasks: [OLD_ROW, RECENT_ROW, OPEN_ROW] });
    const everything = ProgressModel.progressChartOf(board, CHOICES);
    const lastHours = ProgressModel.progressChartOf(board, { ...CHOICES, cutoffEpochMilliseconds: Date.parse('2026-09-18T00:00:00+02:00') });

    expect(everything.rows.map((row) => row.taskId)).toEqual([3, 2, 1]);
    expect(lastHours.rows.map((row) => row.taskId)).toEqual([3, 2]);
    expect(lastHours.shownRowSignature).toBe('2,3');
    expect(lastHours.fromEpochMilliseconds).toBeGreaterThan(Date.parse('2026-09-18T09:00:00+02:00'));
  });
});

describe('bar kinds', () => {
  test('a row without phases is one plain bar; a review pass on its ticket’s row is a review bar', () => {
    const plainRow = ProgressModel.progressChartOf(exampleProgressBoard({ view: ABSOLUTE_VIEW, tasks: [BUILD_ROW] }), CHOICES).rows[0];
    const reviewed = ProgressModel.progressChartOf(reviewedBoard('Review 1 #5', 'Review 2 #5'), CHOICES).rows.find((row) => row.taskId === 1);

    expect(plainRow?.bars.map((bar) => bar.kind)).toEqual(['plain']);
    expect(reviewed?.bars.map((bar) => bar.kind)).toEqual(['plain', 'review', 'review']);
  });

  test('a review pass drawn as a row of its own is a segment in its round’s fill', () => {
    const chart = ProgressModel.progressChartOf(reviewedBoard('Review 1 #5', 'Review 2 #5'), { ...CHOICES, reviewRowsAreShown: true });
    const reviewRow = chart.rows.find((row) => row.taskId === 3);

    expect(reviewRow?.bars.map((bar) => [bar.kind, bar.stateToken])).toEqual([['segment', 're-review']]);
  });
});

describe('review bars, from the Board facts', () => {
  test('draws the review rows above their ticket’s row, latest round its name gives first, and a row without the fact at the top level', () => {
    const chart = ProgressModel.progressChartOf(reviewedBoard('Review 1 #5', 'Review 2 #5'), { ...CHOICES, reviewRowsAreShown: true });

    expect(chart.rows.map((row) => [row.taskId, row.nestedWithTicket])).toEqual([[4, null], [3, '5'], [2, '5'], [1, null]]);
  });

  test('orders a ticket’s review rows by the round their name gives, not by when they were filed', () => {
    const chart = ProgressModel.progressChartOf(reviewedBoard('Review 2 #5', 'Review 1 #5'), { ...CHOICES, reviewRowsAreShown: true });

    expect(chart.rows.map((row) => row.taskId)).toEqual([4, 2, 3, 1]);
  });

  test('draws hidden review rows as segments on their ticket’s row, each in its round’s fill and titled with its round', () => {
    const chart = ProgressModel.progressChartOf(reviewedBoard('Review 1 #5', 'Review 2 #5'), CHOICES);
    const ticketRow = chart.rows.find((row) => row.taskId === 1);

    expect(chart.rows.map((row) => row.taskId)).toEqual([4, 1]);
    expect(ticketRow?.stateToken).toBe('reviewing');
    expect(ticketRow?.bars.filter((bar) => bar.kind === 'review').map((bar) => [bar.stateToken, bar.isLive, bar.title?.split(' · ')[0]])).toEqual([
      ['reviewing', false, 'Review 1'],
      ['re-review', true, 'Review 2'],
    ]);
  });

  test('labels a review row by the ticket it reviews, without a link', () => {
    const chart = ProgressModel.progressChartOf(reviewedBoard('Review 1 #5', 'Review 2 #5'), { ...CHOICES, reviewRowsAreShown: true });
    const reviewRow = chart.rows.find((row) => row.taskId === 2);

    expect([reviewRow?.labelText, reviewRow?.linkedTicketId]).toEqual(['#5', null]);
  });
});

describe('the state chip', () => {
  test('reads Waiting on a to-do row with unmet dependencies and names them in the title', () => {
    const board = exampleProgressBoard({
      tasks:      [exampleProgressTask(1, { ticket: '6', name: 'Example dependent work' })],
      tickets:    [exampleProgressTicket('6')],
      ticketRows: { 6: { ownTaskId: 1 } },
      waitingOn:  { 6: ['5'] },
    });
    const [row] = ProgressModel.progressChartOf(board, CHOICES).rows;

    expect(row?.chipText).toBe('Waiting');
    expect(row?.chipTitle).toBe('To do');
    expect(row?.nameTitle).toBe('Example dependent work\nticket\nWaiting on #5');
  });

  test('checks the Done badge of a delivered row the Board counts as reviewed, and titles it with the review', () => {
    const board = exampleProgressBoard({
      tasks:    [exampleProgressTask(1, { status: 'delivered', reviewed: '2026-09-18T10:30:00+02:00' })],
      rowFacts: { 1: { deliveredRowCountsAsReviewed: true } },
    });
    const [row] = ProgressModel.progressChartOf(board, CHOICES).rows;

    expect(row?.chipText).toBe('Done');
    expect(row?.chipShowsReviewedCheck).toBe(true);
    expect(row?.chipTitle).toStartWith('Done · Reviewed ');
  });
});

describe('changedTaskIdsBetween', () => {
  test('marks nothing on the first board, then the new rows and the rows whose state or review round moved', () => {
    const firstTasks = [exampleProgressTask(1, { status: 'committed' }), exampleProgressTask(2, { status: 'in-progress', reviewRound: 1 }), exampleProgressTask(3)];
    const before = exampleProgressBoard({ tasks: firstTasks });
    const after = exampleProgressBoard({
      tasks: [
        exampleProgressTask(1, { status: 'in-progress' }),
        exampleProgressTask(2, { status: 'in-progress', reviewRound: 2 }),
        exampleProgressTask(3),
        exampleProgressTask(4),
      ],
    });

    expect([...ProgressModel.changedTaskIdsBetween(null, after)]).toEqual([]);
    expect([...ProgressModel.changedTaskIdsBetween(before, after)]).toEqual(['1', '2', '4']);
  });
});
