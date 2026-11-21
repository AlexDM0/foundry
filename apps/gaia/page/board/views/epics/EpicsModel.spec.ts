/**
 * The epic cards on the view model. What matters: open epics show before settled ones; the done mark, the roll-up segments in
 * settled-first order and the facts as worded; the summary is the description's first paragraph as text while the rendered string stays
 * for the sandbox; what an epic waits on and frees follows the cross-epic dependencies of a ticket's primary epic; its waves start with
 * Done; ticket lines are newest first naming their other epics, a repeat review naming the round the forge serves; and a finished epic
 * outside the window hides behind the empty line naming it.
 */
import { describe, expect, test } from 'bun:test';

import {
  EPICS_FIXTURE_NOW,
  epicsBoardFixture,
  PLANTED_EPIC_DESCRIPTION_HTML,
  SETTLED_FIXTURE_EPIC
} from '../../testing/EpicsBoardFixture.ts';
import { FinishedWorkUtil, type FinishedWorkChoice } from '../../utils/FinishedWorkUtil.ts';
import { EpicsModel }                                from './EpicsModel.ts';

const NOW = EPICS_FIXTURE_NOW.getTime();

function windowOf(choice: FinishedWorkChoice) {
  return { choice, cutoffEpochMilliseconds: FinishedWorkUtil.cutoffEpochMillisecondsOf(choice, NOW), nowEpochMilliseconds: NOW };
}

describe('the epic cards', () => {
  const { cards } = EpicsModel.epicsModelOf(epicsBoardFixture(), windowOf('all'));
  const [checkout, billing, archive] = cards;

  test('open epics come first, each part in the Board\'s order', () => {
    expect(cards.map((card) => card.key)).toEqual(['checkout', 'billing', 'archive']);
  });

  test('the done mark, the roll-up segments and the facts', () => {
    expect([checkout?.doneText, archive?.doneText]).toEqual(['1 of 3 done', 'all settled']);
    expect(checkout?.segments.map((segment) => [segment.state, segment.count, segment.label])).toEqual([
      ['delivered', 1, 'Done'], ['in-progress', 1, 'In progress'], ['committed', 1, 'To do'],
    ]);
    expect(checkout?.facts).toEqual([
      { label: 'open', value: '2', title: null },
      { label: 'done', value: '1', title: null },
      { label: 'tokens', value: '12.4k', title: null },
      { label: 'span', value: '10-28 08:00 → now · 1d 4h', title: '2026-10-28 08:00 → still open' },
    ]);
  });

  test('the summary is the first paragraph as text, and the whole description stays as rendered for the sandbox', () => {
    expect([checkout?.summaryText, checkout?.saysMore, checkout?.descriptionHtml]).toEqual(['Example summary', true, PLANTED_EPIC_DESCRIPTION_HTML]);
    expect([billing?.summaryText, billing?.saysMore]).toEqual(['Example billing summary', false]);
  });

  test('an epic waits on the tickets of other epics its own tickets depend on, and frees the epics waiting on its tickets', () => {
    expect(billing?.waitsOn).toEqual([{ ticketId: '3', title: 'Example in progress', epic: { key: 'checkout', title: 'Example checkout', slot: 1 } }]);
    expect(checkout?.waitsOn).toEqual([]);
    expect(checkout?.frees).toEqual([{ epic: { key: 'billing', title: 'Example billing', slot: 3 }, viaText: 'via #3' }]);
  });

  test('its waves start with Done, then each wave holding a ticket it is the primary epic of', () => {
    expect(checkout?.waves.map((column) => [column.label, column.isDone, column.isNarrow, column.pills.map((pill) => pill.ticketId)])).toEqual([
      ['Done', true, false, ['2']], ['Now', false, true, ['3']], ['Wave 2', false, false, ['4']],
    ]);
    expect(billing?.waves.map((column) => [column.label, column.pills.map((pill) => pill.ticketId)])).toEqual([['Wave 2', ['5']]]);
  });

  test('ticket lines are newest first with their state, a live one marked, each naming its other epics', () => {
    expect(checkout?.tickets.map((ticket) => [ticket.ticketId, ticket.stateLabel, ticket.isLive, ticket.otherEpics.map((epic) => epic.key)])).toEqual([
      ['4', 'To do', false, ['billing']], ['3', 'In progress', true, []], ['2', 'Done', false, []],
    ]);
    expect([checkout?.isLive, archive?.isLive]).toEqual([true, false]);
  });

  test('a repeat review names the round the forge serves, and the first repeat round where it serves none', () => {
    const board = epicsBoardFixture();
    const reviewedTicketIds = ['2', '3'];
    const reviewedTicketFacts = board.page.facts.tickets.map((facts) => (reviewedTicketIds.includes(facts.ticketId) ? { ...facts, displayState: 're-review' as const } : facts));
    const reviewed = { ...board, page: { ...board.page, facts: { ...board.page.facts, tickets: reviewedTicketFacts } } };
    const [reviewedCheckout] = EpicsModel.epicsModelOf(reviewed, windowOf('all')).cards;
    expect(reviewedCheckout?.tickets.map((ticket) => [ticket.ticketId, ticket.stateLabel])).toEqual([
      ['4', 'To do'], ['3', 'Reviewing (round 3)'], ['2', 'Reviewing (round 2)'],
    ]);
  });
});

describe('the finished-work window', () => {
  test('the last day hides the epic that settled last week', () => {
    expect(EpicsModel.epicsModelOf(epicsBoardFixture(), windowOf('1d')).cards.map((card) => card.key)).toEqual(['checkout', 'billing']);
  });

  test('with every epic hidden, one line names the window', () => {
    expect(EpicsModel.epicsModelOf(epicsBoardFixture([SETTLED_FIXTURE_EPIC]), windowOf('1h'))).toEqual({ cards: [], emptyText: 'No epic finished in the last hour.' });
  });
});
