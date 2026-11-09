/**
 * The finished-work rules, the static page's read from the Board facts. What matters: the stored key name and default stay the page's, the
 * retired `recent` and anything unreadable read as the default, a span or a since-day sets the cutoff, open work always shows, and the
 * filter line and window phrase read as the page's did.
 */
import { describe, expect, test } from 'bun:test';

import { FIXTURE_NOW, FIXTURE_TICKETS }                                              from '../testing/BoardStateFixture.ts';
import { DEFAULT_FINISHED_WORK_CHOICE, FINISHED_WORK_CHOICE_NAME, FinishedWorkUtil } from './FinishedWorkUtil.ts';

const NOW = FIXTURE_NOW.getTime();

describe('the stored choice', () => {
  test('keeps the static page\'s key name and default', () => {
    expect([FINISHED_WORK_CHOICE_NAME, DEFAULT_FINISHED_WORK_CHOICE]).toEqual(['visibility', '1d']);
  });

  test('reads a span, a real since-day, and falls back to the default for recent, nothing, or a day that does not exist', () => {
    expect(['3d', 'since-2026-10-01', 'recent', null, 'since-2026-02-30', 'soon'].map((stored) => FinishedWorkUtil.choiceFrom(stored)))
      .toEqual(['3d', 'since-2026-10-01', '1d', '1d', '1d', '1d']);
  });
});

describe('what a choice shows', () => {
  test('the last day shows this morning\'s delivery and yesterday\'s abandonment, latest first, and hides the older one', () => {
    const { shown, hiddenCount } = FinishedWorkUtil.finishedTicketsOf(FIXTURE_TICKETS, FinishedWorkUtil.cutoffEpochMillisecondsOf('1d', NOW));
    expect([shown.map((ticket) => ticket.id), hiddenCount]).toEqual([['2', '5'], 1]);
  });

  test('all shows every finished ticket and since a day shows from its local midnight', () => {
    expect(FinishedWorkUtil.finishedTicketsOf(FIXTURE_TICKETS, FinishedWorkUtil.cutoffEpochMillisecondsOf('all', NOW)).hiddenCount).toBe(0);
    expect(FinishedWorkUtil.finishedTicketsOf(FIXTURE_TICKETS, FinishedWorkUtil.cutoffEpochMillisecondsOf('since-2026-10-29', NOW)).shown.map((ticket) => ticket.id))
      .toEqual(['2']);
  });

  test('the filter line and window phrase read as the page\'s', () => {
    expect([
      FinishedWorkUtil.filterLineTextOf('1d', 1),
      FinishedWorkUtil.filterLineTextOf('since-2026-09-24', 2),
      FinishedWorkUtil.filterLineTextOf('1h', 0),
      FinishedWorkUtil.windowPhraseOf('6h'),
      FinishedWorkUtil.windowPhraseOf('all'),
      FinishedWorkUtil.labelOf('since-2026-09-24'),
    ]).toEqual([
      { lead: 'Hiding closed > ', window: '1 day' },
      { lead: 'Hiding closed before ', window: '09-24' },
      { lead: 'Showing all closed', window: '' },
      'in the last 6 hours',
      'ever',
      'since 09-24',
    ]);
  });

  test('the hidden note names tickets and epics, singular or plural, and is empty when nothing is hidden', () => {
    expect([
      FinishedWorkUtil.hiddenWorkNoteTextOf(67, 1),
      FinishedWorkUtil.hiddenWorkNoteTextOf(1, 0),
      FinishedWorkUtil.hiddenWorkNoteTextOf(0, 2),
      FinishedWorkUtil.hiddenWorkNoteTextOf(0, 0),
    ]).toEqual(['67 tickets · 1 epic hidden', '1 ticket hidden', '2 epics hidden', '']);
  });
});
