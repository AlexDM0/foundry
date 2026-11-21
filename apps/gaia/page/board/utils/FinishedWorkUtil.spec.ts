/**
 * The finished-work rules, read from the forge's facts. What matters: the stored key name and default stay as stored, the retired `recent`
 * and anything unreadable read as the default, a span or a since-day sets the cutoff, open work always shows, and the filter line and
 * window phrase are worded. The filter menu's parts: a row's finishing moment and its fallbacks, the span counts and their accessible
 * names, the since field's chosen, incomplete and future days, and what a choice announces.
 */
import { describe, expect, test } from 'bun:test';

import { FIXTURE_NOW, FIXTURE_TICKETS }                                              from '../testing/BoardStateFixture.ts';
import { EXAMPLE_PAGE_LIMITS }                                                       from '../testing/TimestampSlicesFixture.ts';
import { DEFAULT_FINISHED_WORK_CHOICE, FINISHED_WORK_CHOICE_NAME, FinishedWorkUtil } from './FinishedWorkUtil.ts';

const NOW = FIXTURE_NOW.getTime();

describe('the stored choice', () => {
  test('keeps its stored key name and default', () => {
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

describe('the filter menu', () => {
  test('a settled row finished at its end, else its start, else its last phase, else its ticket\'s close; an open row never', () => {
    const ticketClose = Date.parse('2026-10-28T09:00:00');
    const settled = { status: 'delivered', start: '2026-10-28T08:00:00', end: '2026-10-28T08:30:00' };
    expect([
      FinishedWorkUtil.taskFinishedEpochMillisecondsOf(settled, ticketClose),
      FinishedWorkUtil.taskFinishedEpochMillisecondsOf({ ...settled, end: null }, ticketClose),
      FinishedWorkUtil.taskFinishedEpochMillisecondsOf({
        ...settled, start: null, end: null, history: [{ at: '2026-10-28T07:00:00' }]
      }, ticketClose),
      FinishedWorkUtil.taskFinishedEpochMillisecondsOf({ ...settled, start: null, end: null }, ticketClose),
      FinishedWorkUtil.taskFinishedEpochMillisecondsOf({ ...settled, status: 'in-progress' }, ticketClose),
    ]).toEqual([Date.parse('2026-10-28T08:30:00'), Date.parse('2026-10-28T08:00:00'), Date.parse('2026-10-28T07:00:00'), ticketClose, null]);
  });

  test('a span counts the finished items its cutoff lets through, never an open one, and its button names the count and the noun', () => {
    const moments = [NOW - 1000, NOW - 2 * 86_400_000, null];
    expect(FinishedWorkUtil.shownFinishedCountOf(moments, FinishedWorkUtil.cutoffEpochMillisecondsOf('1d', NOW))).toBe(1);
    expect(FinishedWorkUtil.shownFinishedCountOf(moments, FinishedWorkUtil.cutoffEpochMillisecondsOf('all', NOW))).toBe(2);
    expect([FinishedWorkUtil.spanButtonLabelOf('1d', 1, 'task'), FinishedWorkUtil.spanButtonLabelOf('all', 7, 'ticket')])
      .toEqual(['last day: 1 finished task shown', 'all: 7 finished tickets shown']);
  });

  test('the since field shows a chosen day with its midnight and how far back it is, and nothing for a span', () => {
    expect(FinishedWorkUtil.sinceFieldReadingOf(null, 'since-2026-10-27', NOW, EXAMPLE_PAGE_LIMITS)).toEqual({
      value: '2026-10-27', isChosen: true, isInvalid: false, resolvedText: 'from 2026-10-27 00:00 · 2d 12h back',
    });
    expect(FinishedWorkUtil.sinceFieldReadingOf(null, 'since-2026-10-27', NOW, null).resolvedText).toBe('from 2026-10-27 00:00');
    expect(FinishedWorkUtil.sinceFieldReadingOf(null, '1d', NOW, EXAMPLE_PAGE_LIMITS)).toEqual({
      value: '', isChosen: false, isInvalid: false, resolvedText: '',
    });
  });

  test('a typed day that is incomplete asks for a day, and one after today is refused, both keeping what was typed', () => {
    expect(FinishedWorkUtil.sinceFieldReadingOf('', '1d', NOW, EXAMPLE_PAGE_LIMITS)).toEqual({
      value: '', isChosen: false, isInvalid: false, resolvedText: 'Pick a day, or a span above',
    });
    expect(FinishedWorkUtil.sinceFieldReadingOf('2026-10-30', 'since-2026-10-27', NOW, EXAMPLE_PAGE_LIMITS)).toEqual({
      value: '2026-10-30', isChosen: true, isInvalid: true, resolvedText: 'That is after today',
    });
  });

  test('a choice announces its window and what it hides', () => {
    expect([FinishedWorkUtil.choiceAnnouncementOf('all', ''), FinishedWorkUtil.choiceAnnouncementOf('1d', '3 tickets hidden')]).toEqual([
      'Showing unfinished work and work finished ever. Nothing hidden.',
      'Showing unfinished work and work finished in the last day. 3 tickets hidden.',
    ]);
  });
});
