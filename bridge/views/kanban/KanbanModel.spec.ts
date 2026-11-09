/**
 * The Kanban's view model against small synthetic boards. What matters: each ticket lands in the lane its status and the merge queue put
 * it in, ready tickets keep the Board's order, closed lanes read newest first; a draft ticket offers Ready and its lane a multi-select of
 * exactly its draft tickets, a ready ticket offers Hold or Unhold and the other priorities, and no other card offers anything; the card
 * carries the static page's marks (size, priority, type, tokens, epics, waiting-on, hold); filing drafts keep their own card; and the epic
 * chips filter, count and drop a stored chip whose epic went, as the static page's chips did. Ported from its Kanban: "needed first" and
 * `↦ N` (closed lanes none, heavy from five), the hover arrows' links (skipping a card not shown), the Ready lane by wave (filed on a
 * board without dependencies), a closed lane's pages with their clamping, and the Abandoned lane folded by default.
 */
import { describe, expect, test } from 'bun:test';

import type { KanbanBoardState }                               from '../../@types/KanbanBoardState.ts';
import { EXAMPLE_SURROUNDINGS_SHOWING_ALL_FINISHED }           from '../../testing/KanbanBoardFixture.ts';
import { exampleBoard, exampleTicket }                         from '../../testing/KanbanBoardFixture.ts';
import { KANBAN_LANES, KanbanModel, NO_EPIC_CHIP }             from './KanbanModel.ts';
import { CLOSED_LANE_FIRST_PAGE_CARDS, DEFAULT_KANBAN_LAYOUT } from './KanbanModel.ts';
import type {
  KanbanLaneModel,
  KanbanLayoutChoices,
  KanbanSurroundings,
  KanbanViewModel
} from './KanbanModel.ts';

function modelOf(
  state: KanbanBoardState,
  pressedChips: readonly string[] = [],
  layout: KanbanLayoutChoices = DEFAULT_KANBAN_LAYOUT,
  surroundings: KanbanSurroundings = EXAMPLE_SURROUNDINGS_SHOWING_ALL_FINISHED,
): KanbanViewModel {
  return KanbanModel.kanbanModelOf(state, pressedChips, layout, surroundings);
}

function laneNamed(model: KanbanViewModel, key: string): KanbanLaneModel | undefined {
  return model.lanes.find((lane) => lane.key === key);
}

function laneIdsOf(state: KanbanBoardState, pressedChips: readonly string[] = []): Record<string, string[]> {
  const model = modelOf(state, pressedChips);
  return Object.fromEntries(model.lanes.map((lane) => [lane.key, lane.cards.map((card) => card.idText)]));
}

describe('the lanes', () => {
  test('the eight lanes come in order, titled as the design names them', () => {
    const model = modelOf(exampleBoard({ tickets: [] }), []);
    expect(model.lanes.map((lane) => lane.key)).toEqual([...KANBAN_LANES]);
    expect(model.lanes.map((lane) => lane.title)).toEqual(['Drafts', 'Ready for review', 'Ready', 'Building', 'In review', 'Merge queue', 'Done', 'Abandoned']);
  });

  test('each ticket sits in the lane of its status, and a queued in-review ticket in the merge queue', () => {
    const board = exampleBoard({
      tickets: [
        exampleTicket('001', { status: 'draft' }),
        exampleTicket('002'),
        exampleTicket('003', { status: 'in-progress' }),
        exampleTicket('004', { status: 'in-review' }),
        exampleTicket('005', { status: 'in-review' }),
        exampleTicket('006', { status: 'reviewed' }),
        exampleTicket('007', { status: 'delivered', delivered: '2026-10-20T10:00:00+02:00' }),
        exampleTicket('008', { status: 'abandoned', abandonedAt: '2026-10-21T10:00:00+02:00' }),
        exampleTicket('009', { status: 'ready-for-review' }),
      ],
      queuedTicketIds: ['005'],
    });
    expect(laneIdsOf(board)).toEqual({
      'drafts':           ['#001', 'D7'],
      'ready-for-review': ['#009'],
      'ready':            ['#002'],
      'building':         ['#003'],
      'in-review':        ['#004'],
      'merge-queue':      ['#005', '#006'],
      'done':             ['#007'],
      'abandoned':        ['#008'],
    });
  });

  test('a ticket ready for review offers Ready, and its lane offers Ready selected over its tickets', () => {
    const board = exampleBoard({ tickets: [exampleTicket('009', { status: 'ready-for-review' }), exampleTicket('010', { status: 'ready-for-review' })] });
    const lane = modelOf(board, []).lanes.find((candidate) => candidate.key === 'ready-for-review');
    expect(lane?.cards.map((card) => card.actions)).toEqual([
      { readies: true, holdMove: null, priorityChoices: [] },
      { readies: true, holdMove: null, priorityChoices: [] },
    ]);
    expect(lane?.readyableTicketIds).toEqual(['009', '010']);
  });

  test('ready tickets keep the Board\'s order to take them, then the waiting ones by priority; closed lanes read newest first', () => {
    const board = exampleBoard({
      tickets: [
        exampleTicket('010'),
        exampleTicket('011', { priority: 'high' }),
        exampleTicket('012'),
        exampleTicket('013'),
        exampleTicket('020', { status: 'delivered', delivered: '2026-10-01T10:00:00+02:00' }),
        exampleTicket('021', { status: 'delivered', delivered: '2026-10-09T10:00:00+02:00' }),
      ],
      readyTicketIds: ['013', '010'],
    });
    expect(laneIdsOf(board)['ready']).toEqual(['#013', '#010', '#011', '#012']);
    expect(laneIdsOf(board)['done']).toEqual(['#021', '#020']);
  });

  test('an empty lane says so in its own words', () => {
    const building = modelOf(exampleBoard({ tickets: [] }), []).lanes.find((lane) => lane.key === 'building');
    expect(building?.emptyText).toBe('Nothing being built.');
  });
});

describe('the actions', () => {
  const board = exampleBoard({
    tickets: [
      exampleTicket('030', { status: 'draft' }),
      exampleTicket('031', { status: 'draft' }),
      exampleTicket('032', { priority: 'low' }),
      exampleTicket('033', { hold: 'waiting on the example vendor' }),
      exampleTicket('034', { status: 'in-progress' }),
    ],
  });
  const model = modelOf(board, []);
  const cardOf = (idText: string) => model.lanes.flatMap((lane) => lane.cards).find((card) => card.idText === idText);

  test('a draft ticket offers Ready, and the Drafts lane may ready exactly its draft tickets, never a filing draft', () => {
    expect(cardOf('#030')?.actions).toEqual({ readies: true, holdMove: null, priorityChoices: [] });
    expect(model.lanes.find((lane) => lane.key === 'drafts')?.readyableTicketIds).toEqual(['030', '031']);
    expect(cardOf('D7')?.actions).toEqual({ readies: false, holdMove: null, priorityChoices: [] });
    expect(model.lanes.filter((lane) => lane.readyableTicketIds.length > 0).map((lane) => lane.key)).toEqual(['drafts']);
  });

  test('a ready ticket offers Hold, or Unhold once held, and every priority but its own', () => {
    expect(cardOf('#032')?.actions).toEqual({ readies: false, holdMove: 'hold', priorityChoices: ['high', 'normal'] });
    expect(cardOf('#033')?.actions).toEqual({ readies: false, holdMove: 'unhold', priorityChoices: ['high', 'low'] });
  });

  test('a card in any other lane offers nothing', () => {
    expect(cardOf('#034')?.actions).toEqual({ readies: false, holdMove: null, priorityChoices: [] });
  });
});

describe('the card', () => {
  test('a ticket card carries its size, priority, type, tokens, epics, waiting-on and hold, as the static page\'s card does', () => {
    const board = exampleBoard({
      tickets: [exampleTicket('040', {
        size: 'L', priority: 'high', type: 'bug', epics: ['billing', 'gone'], hold: ''
      })],
      waitingOn:  { '040': ['039'] },
      tokensById: { '040': 12_345 },
    });
    const [card] = modelOf(board, []).lanes.find((lane) => lane.key === 'ready')?.cards ?? [];
    expect(card).toEqual({
      key:                'ticket:040',
      ticketId:           '040',
      filingDraftId:      null,
      idText:             '#040',
      title:              'Example ticket 040',
      stateToken:         'pending',
      hasRow:             true,
      isLive:             false,
      draftLabel:         null,
      size:               'L',
      priority:           'high',
      ticketType:         'bug',
      tokensText:         '12.3k tokens',
      epics:              [{ key: 'billing', title: 'Example billing', slot: 4 }],
      waitingOnTicketIds: ['039'],
      heldTitle:          'Held',
      noRowTitle:         null,
      note:               null,
      reviewedTitle:      null,
      stamp:              { shortText: 'filed 10-01 09:00', fullText: 'filed 2026-10-01 09:00', ticks: false },
      ariaLabel:          '#040 Example ticket 040, To do, high priority',
      actions:            { readies: false, holdMove: 'unhold', priorityChoices: ['normal', 'low'] },
      hasNeededFirst:     false,
      heldCount:          null,
      dependsOnTicketIds: [],
    });
  });

  test('a draft ticket is labelled "draft ticket" and a filing draft "filing draft", the filing draft with its state line', () => {
    const drafts = modelOf(exampleBoard({ tickets: [exampleTicket('050', { status: 'draft' })] }), []).lanes[0]?.cards ?? [];
    expect(drafts.map((card) => [card.idText, card.stateToken, card.draftLabel, card.note])).toEqual([
      ['#050', 'draft', 'draft ticket', null],
      ['D7', 'draft', 'filing draft', 'Waiting on you · 2 open questions'],
    ]);
  });
});

describe('the epic chips', () => {
  const board = exampleBoard({
    tickets: [
      exampleTicket('060', { epics: ['checkout'] }),
      exampleTicket('061', { epics: ['checkout', 'billing'] }),
      exampleTicket('062'),
      exampleTicket('063', { status: 'delivered', delivered: '2026-10-02T10:00:00+02:00', epics: ['billing'] }),
    ],
  });

  test('an epic holding an open ticket gets a chip, the no-epic chip comes last, and each counts every ticket answering to it', () => {
    const model = modelOf(board, []);
    expect(model.epicChips).toEqual([
      { value: 'checkout', label: 'Example checkout', slot: 2 },
      { value: 'billing', label: 'Example billing', slot: 4 },
      { value: NO_EPIC_CHIP, label: 'No epic' },
    ]);
    expect([...model.countByChip]).toEqual([['checkout', 2], ['billing', 2], [NO_EPIC_CHIP, 1]]);
  });

  test('pressed chips are alternatives: a ticket in any pressed epic stays, every other ticket leaves its lane', () => {
    expect(laneIdsOf(board, ['billing'])['ready']).toEqual(['#061']);
    expect(laneIdsOf(board, ['billing', NO_EPIC_CHIP])['ready']).toEqual(['#061', '#062']);
    expect(laneIdsOf(board, ['billing'])['done']).toEqual(['#063']);
  });

  test('a stored chip whose epic has no chip any more presses nothing, so it cannot narrow the board unseen', () => {
    const model = modelOf(board, ['retired-epic']);
    expect(model.pressedChips).toEqual([]);
    expect(laneIdsOf(board, ['retired-epic'])['ready']).toEqual(['#060', '#061', '#062']);
  });
});

describe('the dependency marks', () => {
  const board = exampleBoard({
    tickets: [
      exampleTicket('070'),
      exampleTicket('071', { dependsOn: ['070'] }),
      exampleTicket('072', { dependsOn: ['071'] }),
      exampleTicket('073', { status: 'delivered', delivered: '2026-10-02T10:00:00+02:00' }),
      exampleTicket('074', { dependsOn: ['073'] }),
    ],
  });
  const cardOf = (idText: string) => modelOf(board, []).lanes.flatMap((lane) => lane.cards).find((card) => card.idText === idText);

  test('a ticket another depends on is marked needed first, and one nothing depends on is not', () => {
    expect(['#070', '#071', '#072', '#073'].map((idText) => cardOf(idText)?.hasNeededFirst)).toEqual([true, true, false, true]);
  });

  test('↦ N counts the open tickets waiting on an unfinished one down the chain; a closed lane\'s card and one nothing waits on show none', () => {
    expect(cardOf('#070')?.heldCount).toEqual({ count: 2, isHeavy: false, title: '2 tickets wait on this one, directly or further down the chain' });
    expect(cardOf('#071')?.heldCount?.title).toBe('1 ticket waits on this one, directly or further down the chain');
    expect(cardOf('#072')?.heldCount).toBeNull();
    expect(cardOf('#073')?.heldCount).toBeNull();
  });

  test('five or more waiting tickets make the ↦ N heavy', () => {
    const chain = ['080', '081', '082', '083', '084', '085'].map((id, index, ids) => exampleTicket(id, index === 0 ? {} : { dependsOn: [ids[index - 1] ?? ''] }));
    const heavy = modelOf(exampleBoard({ tickets: chain }), []).lanes.flatMap((lane) => lane.cards).find((card) => card.idText === '#080');
    expect(heavy?.heldCount?.count).toBe(5);
    expect(heavy?.heldCount?.isHeavy).toBe(true);
  });

  test('a card carries the tickets it directly depends on, and the board says it has dependencies', () => {
    expect(cardOf('#072')?.dependsOnTicketIds).toEqual(['071']);
    expect(modelOf(board, []).boardHasDependencies).toBe(true);
    expect(modelOf(exampleBoard({ tickets: [exampleTicket('070')] }), []).boardHasDependencies).toBe(false);
  });
});

describe('the dependency arrows', () => {
  const board = exampleBoard({
    tickets: [
      exampleTicket('090'),
      exampleTicket('091', { status: 'in-progress' }),
      exampleTicket('092', { dependsOn: ['090', '091', '093', '099'] }),
      exampleTicket('093', { status: 'abandoned', abandonedAt: '2026-10-02T10:00:00+02:00' }),
    ],
  });

  test('hovering a card links each shown card it directly depends on, same lane or not, and skips one not on the board', () => {
    const model = modelOf(board, [], { ...DEFAULT_KANBAN_LAYOUT, abandonedLaneIsOpen: true });
    expect(KanbanModel.dependencyArrowLinksOf(model, '092')).toEqual([
      { dependencyCardKey: 'ticket:090', isSameLane: true },
      { dependencyCardKey: 'ticket:091', isSameLane: false },
      { dependencyCardKey: 'ticket:093', isSameLane: false },
    ]);
  });

  test('a card in the folded Abandoned lane gets no arrow, and a hovered card nothing depends through draws none', () => {
    const model = modelOf(board, []);
    expect(KanbanModel.dependencyArrowLinksOf(model, '092').map((link) => link.dependencyCardKey)).toEqual(['ticket:090', 'ticket:091']);
    expect(KanbanModel.dependencyArrowLinksOf(model, '090')).toEqual([]);
  });
});

describe('the Ready lane by wave', () => {
  const board = exampleBoard({
    tickets: [
      exampleTicket('100'),
      exampleTicket('101'),
      exampleTicket('102', { dependsOn: ['100'] }),
      exampleTicket('103', { dependsOn: ['102'] }),
    ],
    readyTicketIds: ['101', '100'],
  });
  const byWave = { ...DEFAULT_KANBAN_LAYOUT, readyOrder: 'by-wave' as const };

  test('filed keeps the Board\'s order and no waves', () => {
    const ready = modelOf(board, []).lanes.find((lane) => lane.key === 'ready');
    expect(ready?.groups.map((group) => group.kind)).toEqual(['plain']);
    expect(ready?.cards.map((card) => card.idText)).toEqual(['#101', '#100', '#102', '#103']);
  });

  test('by wave groups the Ready cards per wave, the first noting how many are ready, a one-ticket wave narrow', () => {
    const ready = modelOf(board, [], byWave).lanes.find((lane) => lane.key === 'ready');
    expect(ready?.groups.map((group) => (group.kind === 'wave'
      ? [group.label, group.note, group.isNarrow, group.cards.map((card) => card.idText)]
      : group.kind))).toEqual([
      ['Now', '2 ready · 2 side by side', false, ['#100', '#101']],
      ['Wave 2', 'one at a time', true, ['#102']],
      ['Wave 3', 'one at a time', true, ['#103']],
    ]);
    expect(ready?.cards.map((card) => card.idText)).toEqual(['#100', '#101', '#102', '#103']);
  });

  test('a board without dependencies stays filed whatever was stored', () => {
    const model = modelOf(exampleBoard({ tickets: [exampleTicket('100')] }), [], byWave);
    expect(model.readyOrder).toBe('filed');
    expect(laneNamed(model, 'ready')?.groups.map((group) => group.kind)).toEqual(['plain']);
  });
});

describe('the closed lanes\' pages', () => {
  const deliveredStampOf = (minute: number) => `2026-10-01T10:${String(minute).padStart(2, '0')}:00+02:00`;
  const deliveredTickets = Array.from({ length: 45 }, (_ticket, i) => exampleTicket(String(200 + i), { status: 'delivered', delivered: deliveredStampOf(i) }));
  const board = exampleBoard({ tickets: deliveredTickets });
  const doneLaneOf = (shownCount: number) => {
    const shownCountByClosedLane = { done: shownCount, abandoned: CLOSED_LANE_FIRST_PAGE_CARDS };
    return modelOf(board, [], { ...DEFAULT_KANBAN_LAYOUT, shownCountByClosedLane }).lanes.find((lane) => lane.key === 'done');
  };

  test('a closed lane shows its first page, newest first, and offers the next page while counting every card', () => {
    const done = doneLaneOf(CLOSED_LANE_FIRST_PAGE_CARDS);
    expect(done?.count).toBe(45);
    expect(done?.cards.length).toBe(15);
    expect(done?.cards[0]?.idText).toBe('#244');
    expect(done?.footer).toEqual({
      paging: {
        shownCount: 15, laneCount: 45, nextPageSize: 25, firstPageSize: null
      },
      hiddenCount: 0,
    });
  });

  test('more shows the next page, the last page only what is left, and either offers going back to the first', () => {
    expect(KanbanModel.shownCountAfterMore(15, 45)).toBe(40);
    expect(doneLaneOf(40)?.footer?.paging).toEqual({
      shownCount: 40, laneCount: 45, nextPageSize: 5, firstPageSize: 15
    });
    expect(doneLaneOf(KanbanModel.shownCountAfterMore(40, 45))?.footer?.paging?.nextPageSize).toBe(0);
  });

  test('a requested count is clamped to the first page and the lane, and a lane of one page has no paging', () => {
    expect(doneLaneOf(3)?.cards.length).toBe(15);
    expect(doneLaneOf(Number.NaN)?.cards.length).toBe(15);
    expect(doneLaneOf(999)?.cards.length).toBe(45);
    const small = modelOf(exampleBoard({ tickets: deliveredTickets.slice(0, 15) }), []).lanes.find((lane) => lane.key === 'done');
    expect(small?.footer).toBeNull();
  });
});

describe('the Abandoned lane\'s fold', () => {
  const board = exampleBoard({ tickets: [exampleTicket('300', { status: 'abandoned', abandonedAt: '2026-10-02T10:00:00+02:00' })] });

  test('the Abandoned lane is folded by default and opens on the viewer\'s choice, each offering the other; no other lane folds', () => {
    const lanesOf = (abandonedLaneIsOpen: boolean) => modelOf(board, [], { ...DEFAULT_KANBAN_LAYOUT, abandonedLaneIsOpen }).lanes;
    expect(lanesOf(false).find((lane) => lane.key === 'abandoned')?.collapse).toEqual({ isCollapsed: true, toggleTitle: 'Show the abandoned tickets' });
    expect(lanesOf(true).find((lane) => lane.key === 'abandoned')?.collapse).toEqual({ isCollapsed: false, toggleTitle: 'Collapse the abandoned tickets' });
    expect(lanesOf(false).filter((lane) => lane.collapse !== null).map((lane) => lane.key)).toEqual(['abandoned']);
    expect(lanesOf(false).find((lane) => lane.key === 'abandoned')?.count).toBe(1);
  });
});

describe('reading the state document', () => {
  test('a document lacking the page payload or the merge queue reads as no Kanban board, and a full one reads as itself', () => {
    const board = exampleBoard({ tickets: [] });
    expect(KanbanModel.kanbanBoardStateOf(null)).toBeNull();
    expect(KanbanModel.kanbanBoardStateOf({ page: board.page })).toBeNull();
    expect(KanbanModel.kanbanBoardStateOf({ mergeQueue: board.mergeQueue, page: { tickets: [] } })).toBeNull();
    expect(KanbanModel.kanbanBoardStateOf(board)).toBe(board);
  });
});

describe('the lane groups', () => {
  test('Ready holding more than one priority divides into runs by priority, each counting the whole lane\'s cards of it', () => {
    const board = exampleBoard({ tickets: [exampleTicket('400', { priority: 'high' }), exampleTicket('401'), exampleTicket('402', { priority: 'low' })] });
    const ready = laneNamed(modelOf(board), 'ready');
    expect(ready?.groups.map((group) => (group.kind === 'priority' ? [group.title, group.count] : group.kind))).toEqual([['High', 1], ['Normal', 1], ['Low', 1]]);
    const oneKind = laneNamed(modelOf(exampleBoard({ tickets: [exampleTicket('400'), exampleTicket('401')] })), 'ready');
    expect(oneKind?.groups.map((group) => group.kind)).toEqual(['plain']);
  });

  test('Building and In review put their working cards first under their own heads, whatever their priority', () => {
    const board = exampleBoard({
      tickets: [
        exampleTicket('410', { status: 'in-progress', priority: 'high' }),
        exampleTicket('411', { status: 'in-progress' }),
        exampleTicket('412', { status: 'in-review', priority: 'high' }),
        exampleTicket('413', { status: 'in-review' }),
      ],
      displayStateById: { 410: 'paused', 413: 're-review' },
    });
    const model = modelOf(board);
    const groupsOf = (key: string) => laneNamed(model, key)?.groups.map((group) => (group.kind === 'state'
      ? [group.title, group.count, group.cards.map((card) => card.idText)]
      : group.kind));
    expect(groupsOf('building')).toEqual([['Building', 1, ['#411']], ['Paused', 1, ['#410']]]);
    expect(groupsOf('in-review')).toEqual([['Reviewing', 1, ['#413']], ['Awaiting review', 1, ['#412']]]);
  });
});

describe('the lane heads', () => {
  test('each head\'s hover counts what its lane holds, as the static heads word it, and a lane with nothing to tell has none', () => {
    const board = exampleBoard({
      tickets: [
        exampleTicket('420', { hold: '' }),
        exampleTicket('421'),
        exampleTicket('422', { status: 'in-progress' }),
        exampleTicket('423', { status: 'delivered', delivered: '2026-10-09T10:00:00+02:00' }),
      ],
      waitingOn:   { 421: ['422'] },
      ownRowsById: { 420: {}, 423: { countsAsReviewed: true } },
    });
    const model = modelOf(board);
    expect(model.lanes.map((lane) => [lane.key, lane.subtitle])).toEqual([
      ['drafts', null],
      ['ready-for-review', null],
      ['ready', '1 waiting · 1 held · 1 no row'],
      ['building', '• 1 in progress'],
      ['in-review', null],
      ['merge-queue', 'by priority'],
      ['done', 'newest first · ✓1 reviewed first'],
      ['abandoned', 'newest first'],
    ]);
  });

  test('In review takes the reviewing colours of the static Review lane, the drafts lanes the draft colours', () => {
    expect(modelOf(exampleBoard({ tickets: [] })).lanes.map((lane) => lane.dotState))
      .toEqual(['draft', 'ready-for-review', 'pending', 'in-progress', 'reviewing', 'reviewed', 'delivered', 'abandoned']);
  });
});

describe('the card\'s marks and state', () => {
  const board = exampleBoard({
    tickets: [
      exampleTicket('430'),
      exampleTicket('431', { status: 'in-progress' }),
      exampleTicket('432', { status: 'reviewed', finished: '2026-10-09T12:20:00+02:00' }),
      exampleTicket('433', { status: 'delivered', delivered: '2026-10-09T10:00:00+02:00' }),
      exampleTicket('434', { status: 'abandoned', abandonedAt: '2026-10-08T10:00:00+02:00', reason: 'Example vendor dropped it' }),
    ],
    ownRowsById: {
      431: { start: '2026-10-10T11:00:00+02:00' },
      432: { reviewed: '2026-10-09T13:28:00+02:00' },
      433: { countsAsReviewed: true },
    },
  });
  const model = modelOf(board, [], { ...DEFAULT_KANBAN_LAYOUT, abandonedLaneIsOpen: true });
  const cardOf = (idText: string) => model.lanes.flatMap((lane) => lane.cards).find((card) => card.idText === idText);

  test('a card has a row\'s bar only with a row, and only a card an agent works on is live', () => {
    expect(['#430', '#431', '#432'].map((idText) => [cardOf(idText)?.hasRow, cardOf(idText)?.isLive])).toEqual([[false, false], [true, true], [true, false]]);
    expect(model.hasTickingStamp).toBe(true);
  });

  test('a Ready ticket without a row says so, a reviewed one when it was reviewed and built, an abandoned one why, and a reviewed delivery its ✓', () => {
    expect(cardOf('#430')?.noRowTitle).toBe('Low priority: it gets a row on the Progress chart once it is started');
    expect(cardOf('#431')?.noRowTitle).toBeNull();
    expect(cardOf('#432')?.note).toBe('reviewed 10-09 13:28');
    expect(cardOf('#434')?.note).toBe('Example vendor dropped it');
    expect(cardOf('#433')?.reviewedTitle).toBe('Reviewed before it was done');
    expect(cardOf('#432')?.stamp?.shortText).toBe('built 10-09 12:20');
  });
});

describe('the finished-work window', () => {
  const board = exampleBoard({
    tickets: [
      exampleTicket('440', { status: 'delivered', delivered: '2026-10-10T10:00:00+02:00' }),
      exampleTicket('441', { status: 'delivered', delivered: '2026-10-01T10:00:00+02:00' }),
      exampleTicket('442', { status: 'abandoned', abandonedAt: '2026-10-01T10:00:00+02:00' }),
    ],
  });
  const lastDay: KanbanSurroundings = { ...EXAMPLE_SURROUNDINGS_SHOWING_ALL_FINISHED, finishedWorkChoice: '1d', cutoffEpochMilliseconds: Date.parse('2026-10-09T12:00:00+02:00') };

  test('a closed lane counts and shows only what the window lets through, and its footer says how many it hides', () => {
    const model = modelOf(board, [], DEFAULT_KANBAN_LAYOUT, lastDay);
    expect([laneNamed(model, 'done')?.count, laneNamed(model, 'done')?.cards.map((card) => card.idText)]).toEqual([1, ['#440']]);
    expect(laneNamed(model, 'done')?.footer).toEqual({ paging: null, hiddenCount: 1 });
    expect(laneNamed(model, 'abandoned')?.emptyText).toBe('Nothing abandoned in the last day.');
  });

  test('showing all, a closed lane hides nothing and its empty text reaches back for ever', () => {
    const model = modelOf(board);
    expect(laneNamed(model, 'done')?.footer).toBeNull();
    expect(laneNamed(modelOf(exampleBoard({ tickets: [] })), 'done')?.emptyText).toBe('Nothing done yet.');
  });
});

describe('the edge fades', () => {
  test('the board fades the edges it can still scroll to, within a pixel, and none when it fits', () => {
    expect(KanbanModel.overflowDirectionsOf(0, 1000, 1000)).toBeNull();
    expect(KanbanModel.overflowDirectionsOf(0, 1600, 1000)).toBe('end');
    expect(KanbanModel.overflowDirectionsOf(300, 1600, 1000)).toBe('start end');
    expect(KanbanModel.overflowDirectionsOf(599.5, 1600, 1000)).toBe('start');
  });
});
