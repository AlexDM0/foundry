/**
 * The Tickets view model: the search (title, branch, group, epic, body text read back from its markup, an id query looking at the id
 * alone), the chips (OR inside a group, AND across, counts that ignore their own group, a repeat review under Reviewing), the sort and its
 * ties, grouping by primary epic, the empty table's phrase and the count line. The state, priority, review round and waiting-on come from
 * the forge's served facts, which the fixture sets apart from the stored fields. A ticket is changed against the previous board when it is
 * new or its display state moved; Flint's tickets habitat reads each ticket's resolved priority.
 */
import { describe, expect, test } from 'bun:test';

import type { BoardTicketDocument }                                     from '../../../@types/board/BoardTicketDocuments.ts';
import { exampleTicketsBoard, exampleTicketsRow, exampleTicketsTicket } from '../../testing/TicketsBoardFixture.ts';
import type { MatchPiece }                                              from '../../utils/SearchMatchUtil.ts';
import {
  DEFAULT_TICKET_VIEW,
  NO_EPIC_CHIP,
  TicketsModel,
  type TicketsModelMoment,
  type TicketView
} from './TicketsModel.ts';

const EVERY_TICKET: TicketsModelMoment = { cutoffEpochMilliseconds: Number.NEGATIVE_INFINITY, nowEpochMilliseconds: Date.parse('2026-09-18T12:00:00+02:00') };

/** A ticket the forge serves as a repeat review in the given round. */
function inRepeatReview(ticket: BoardTicketDocument, reviewRound: number): BoardTicketDocument {
  return { ...ticket, facts: { ...ticket.facts, reviewRound, isRepeatReview: true } };
}

const BOARD = exampleTicketsBoard({
  tickets: [
    exampleTicketsTicket('001', { title: 'Add dark mode', branch: 'ticket-001', status: 'delivered' }),
    exampleTicketsTicket('002', {
      title: 'Fix the export', type: 'bug', group: 'export-work', epics: ['billing'], priority: 'high'
    }),
    exampleTicketsTicket('003', {
      title: 'Research a vendor', type: 'research', epics: ['checkout', 'billing'], priority: 'low', task: 7
    }),
    inRepeatReview(exampleTicketsTicket('012', { bodyHtml: '<p class="darkroom">Ships the <em>night</em> theme &amp; its toggle</p>', status: 'in-review' }), 3),
  ],
  displayStates: { '012': 're-review' },
  waitingOn:     { '003': ['002'] },
  ownRows:       { '012': exampleTicketsRow(9, { status: 're-review', reviewRound: 3 }) },
});

function shownIds(view: Partial<TicketView> = {}, groupedByEpic = false): string[] {
  return TicketsModel.ticketsModelOf(BOARD, { ...DEFAULT_TICKET_VIEW, ...view }, groupedByEpic, EVERY_TICKET).groups.flatMap((group) => group.rows.map((row) => row.ticketId));
}

function joined(pieces: readonly MatchPiece[]): string {
  return pieces.map((piece) => (piece.isMatch ? `[${piece.text}]` : piece.text)).join('');
}

describe('the search and the chips', () => {
  test('shows every ticket newest first by default', () => {
    expect(shownIds()).toEqual(['012', '003', '002', '001']);
  });

  test('searches the title, branch and group, whatever the case', () => {
    expect(shownIds({ searchText: 'DARK' })).toEqual(['001']);
    expect(shownIds({ searchText: 'ticket-001' })).toEqual(['001']);
    expect(shownIds({ searchText: 'export-WORK' })).toEqual(['002']);
  });

  test('finds a ticket by the key or the title of any of its epics', () => {
    expect(shownIds({ searchText: 'checkout' })).toEqual(['003']);
    expect(shownIds({ searchText: 'example billing' })).toEqual(['003', '002']);
  });

  test('finds a phrase only its body holds, the escaped characters read back, and never a word inside a tag', () => {
    expect(shownIds({ searchText: 'night theme & its' })).toEqual(['012']);
    expect(shownIds({ searchText: 'darkroom' })).toEqual([]);
  });

  test('looks for an id, with or without its #, and only in the id', () => {
    expect(shownIds({ searchText: '#12' })).toEqual(['012']);
    expect(shownIds({ searchText: '1' })).toEqual(['012', '001']);
  });

  test('combines the search with a chip as an AND, and the chips of one group as an OR', () => {
    expect(shownIds({ typeChips: ['bug', 'research'] })).toEqual(['003', '002']);
    expect(shownIds({ typeChips: ['bug', 'research'], searchText: 'vendor' })).toEqual(['003']);
  });

  test('keeps a ticket in any pressed epic, the tickets in none under the no-epic chip, and drops a chip naming no epic', () => {
    expect(shownIds({ epicChips: ['checkout'] })).toEqual(['003']);
    expect(shownIds({ epicChips: [NO_EPIC_CHIP] })).toEqual(['012', '001']);
    expect(shownIds({ epicChips: ['retired-epic'] })).toEqual(['012', '003', '002', '001']);
  });

  test('a repeat review answers to the one Reviewing chip, by the forge\'s display state', () => {
    expect(shownIds({ statusChips: ['reviewing'] })).toEqual(['012']);
    expect(shownIds({ statusChips: ['in-review'] })).toEqual([]);
  });

  test('a chip counts what pressing it would show: the search and the other groups apply, its own group does not', () => {
    const model = TicketsModel.ticketsModelOf(BOARD, { ...DEFAULT_TICKET_VIEW, typeChips: ['bug'], epicChips: ['billing'] }, false, EVERY_TICKET);
    expect(Object.fromEntries(model.countByChip.type)).toEqual({ ticket: 0, bug: 1, research: 1 });
    expect(Object.fromEntries(model.countByChip.epic)).toEqual({ billing: 1 });
    expect(model.countByChip.status.get('committed')).toBe(1);
  });
});

describe('the sort', () => {
  test('a second press reverses the column; a new column starts ascending, the id newest first', () => {
    const byTitle = TicketsModel.viewSortedBy(DEFAULT_TICKET_VIEW, 'title');
    expect([byTitle.sortKey, byTitle.sortDirection]).toEqual(['title', 'ascending']);
    expect(TicketsModel.viewSortedBy(byTitle, 'title').sortDirection).toBe('descending');
    expect(TicketsModel.viewSortedBy(byTitle, 'id').sortDirection).toBe('descending');
  });

  test('a ticket in no epic or on no branch sorts last whichever way, and ties fall back to newest first', () => {
    expect(shownIds({ sortKey: 'epic', sortDirection: 'ascending' })).toEqual(['002', '003', '012', '001']);
    expect(shownIds({ sortKey: 'epic', sortDirection: 'descending' })).toEqual(['003', '002', '012', '001']);
    expect(shownIds({ sortKey: 'branch', sortDirection: 'descending' })).toEqual(['001', '012', '003', '002']);
  });
});

describe('the rows', () => {
  test('a row carries its id, served state label with its round, priority, type, waiting-on, epics and task', () => {
    const rows = TicketsModel.ticketsModelOf(BOARD, DEFAULT_TICKET_VIEW, false, EVERY_TICKET).groups[0]?.rows ?? [];
    const [review, research] = rows;
    expect([review?.idText, review?.stateToken, review?.stateLabel, review?.priority, review?.task]).toEqual(['#012', 're-review', 'Reviewing (round 3)', null, null]);
    expect([research?.priority, research?.ticketType, research?.waitingOn, research?.epics.map((epic) => epic.key), research?.task])
      .toEqual(['low', 'research', ['002'], ['checkout', 'billing'], { taskId: 7, labelText: '#003' }]);
    expect([rows[2]?.priority, rows[3]?.ticketType]).toEqual(['high', 'ticket']);
  });

  test('marks the search in the title, the group and the branch, but not an id query', () => {
    const model = TicketsModel.ticketsModelOf(BOARD, { ...DEFAULT_TICKET_VIEW, searchText: 'EXPORT' }, false, EVERY_TICKET);
    const [row] = model.groups[0]?.rows ?? [];
    expect([joined(row?.titlePieces ?? []), joined(row?.integration?.groupPieces ?? [])]).toEqual(['Fix the [export]', '[export]-work']);
    const idQuery = TicketsModel.ticketsModelOf(BOARD, { ...DEFAULT_TICKET_VIEW, searchText: '001' }, false, EVERY_TICKET);
    expect(idQuery.groups[0]?.rows[0]?.branchPieces).toEqual([{ text: 'ticket-001', isMatch: false }]);
  });

  test('grouped, each epic\'s tickets follow its head, a ticket under its primary epic only, then the tickets in none', () => {
    const model = TicketsModel.ticketsModelOf(BOARD, DEFAULT_TICKET_VIEW, true, EVERY_TICKET);
    expect(model.groups.map((group) => [group.key, group.showsHead, group.rows.map((row) => row.ticketId)])).toEqual([
      ['billing', true, ['002']],
      ['checkout', true, ['003']],
      [NO_EPIC_CHIP, true, ['012', '001']],
    ]);
  });

  test('a board without epics stays flat, offering no epic chip', () => {
    const board = exampleTicketsBoard({ tickets: [exampleTicketsTicket('001')], withoutEpics: true });
    const model = TicketsModel.ticketsModelOf(board, DEFAULT_TICKET_VIEW, true, EVERY_TICKET);
    expect([model.showsEpics, model.epicChips, model.groups.map((group) => group.showsHead)]).toEqual([false, [], [false]]);
  });
});

describe('the empty table and the count', () => {
  test('says what was asked, a pressed epic by its title and the no-epic chip as itself', () => {
    const model = TicketsModel.ticketsModelOf(BOARD, {
      ...DEFAULT_TICKET_VIEW, searchText: ' nothing ', statusChips: ['paused'], typeChips: ['bug'], epicChips: ['checkout', NO_EPIC_CHIP]
    }, false, EVERY_TICKET);
    expect([model.emptyText, model.narrows]).toEqual(['No ticket matches “nothing”, status Paused, type bug, epic Example checkout or no epic.', true]);
  });

  test('a board without tickets says so in the count and shows no empty row', () => {
    const model = TicketsModel.ticketsModelOf(exampleTicketsBoard({ tickets: [] }), DEFAULT_TICKET_VIEW, false, EVERY_TICKET);
    expect([model.countText, model.emptyText]).toEqual(['No tickets', null]);
  });

  test('counts the shown against all, and the tickets in progress', () => {
    const board = exampleTicketsBoard({ tickets: [exampleTicketsTicket('001', { status: 'in-progress' }), exampleTicketsTicket('002')] });
    expect(TicketsModel.ticketsModelOf(board, { ...DEFAULT_TICKET_VIEW, searchText: '#2' }, false, EVERY_TICKET).countText).toBe('1 of 2 tickets · 1 in progress');
  });
});

describe('the finished-work window', () => {
  const board = exampleTicketsBoard({
    tickets: [
      exampleTicketsTicket('001', { title: 'Closed long ago', status: 'delivered', delivered: '2026-09-01T10:00:00+02:00' }),
      exampleTicketsTicket('002', { title: 'Closed this morning', status: 'abandoned', abandonedAt: '2026-09-18T09:00:00+02:00' }),
      exampleTicketsTicket('003', { title: 'Still open' }),
    ],
  });
  const lastDay: TicketsModelMoment = { cutoffEpochMilliseconds: Date.parse('2026-09-17T12:00:00+02:00'), nowEpochMilliseconds: Date.parse('2026-09-18T12:00:00+02:00') };
  const shownWithin = (view: Partial<TicketView>): string[] => TicketsModel.ticketsModelOf(board, { ...DEFAULT_TICKET_VIEW, ...view }, false, lastDay)
    .groups.flatMap((group) => group.rows.map((row) => row.ticketId));

  test('unnarrowed, the table hides a ticket closed before the window and counts it among all', () => {
    expect(shownWithin({})).toEqual(['003', '002']);
    expect(TicketsModel.ticketsModelOf(board, DEFAULT_TICKET_VIEW, false, lastDay).countText).toBe('2 of 3 tickets');
  });

  test('a search or a pressed chip looks through every ticket, the hidden ones too', () => {
    expect(shownWithin({ searchText: 'closed' })).toEqual(['002', '001']);
    expect(shownWithin({ statusChips: ['delivered'] })).toEqual(['001']);
  });
});

describe('the marks a row carries', () => {
  const board = exampleTicketsBoard({
    tickets: [
      exampleTicketsTicket('001', { group: 'export', releasesGroup: true }),
      exampleTicketsTicket('002', { group: 'export', status: 'in-progress', task: 4 }),
      exampleTicketsTicket('003', { group: 'import' }),
    ],
    displayStates: { '002': 'paused' },
    ownRows:       {
      '002': exampleTicketsRow(4, {
        status:  'paused',
        note:    'Example pause note',
        history: [
          { status: 'in-progress', at: '2026-09-18T08:00:00+02:00' },
          { status: 'paused', at: '2026-09-18T09:00:00+02:00' },
          { status: 'in-progress', at: '2026-09-18T09:30:00+02:00' },
          { status: 'paused', at: '2026-09-18T10:15:00+02:00' },
        ],
      }),
    },
  });
  const rowById = new Map((TicketsModel.ticketsModelOf(board, DEFAULT_TICKET_VIEW, false, EVERY_TICKET).groups[0]?.rows ?? []).map((row) => [row.ticketId, row]));

  test('a grouped ticket says where it lands: the release ticket names the rest, a member its release, a lone one that none exists', () => {
    expect(['001', '002', '003'].map((ticketId) => rowById.get(ticketId)?.integration?.title)).toEqual([
      'Releases group-export with #002',
      'Lands together on group-export, released with #001',
      'Lands together on group-import, no release ticket yet',
    ]);
  });

  test('a paused build shows since its last pause and for how long, its row\'s note on hover; nothing else shows a pause', () => {
    expect([rowById.get('002')?.pauseText, rowById.get('002')?.pauseTitle]).toEqual(['since 10:15 · 1h 45m', 'Example pause note']);
    expect(rowById.get('001')?.pauseText).toBeNull();
  });

  test('the task cell names the ticket\'s own row by the ticket, never by the row\'s number', () => {
    expect(rowById.get('002')?.task).toEqual({ taskId: 4, labelText: '#002' });
  });
});

describe('the epic head rows', () => {
  test('each head carries its epic\'s roll-up: segments settled first, done text and facts', () => {
    const board = exampleTicketsBoard({
      tickets: [
        exampleTicketsTicket('001', { epics: ['billing'], status: 'delivered' }),
        exampleTicketsTicket('002', { epics: ['billing'] }),
      ],
    });
    const [head] = TicketsModel.ticketsModelOf(board, DEFAULT_TICKET_VIEW, true, EVERY_TICKET).groups.map((group) => group.head);
    expect([head?.epic.key, head?.segments.map((segment) => [segment.state, segment.count]), head?.doneText, head?.rollupLabel]).toEqual([
      'billing', [['delivered', 1], ['committed', 1]], '1 of 2 done', '1 of 2 done tickets',
    ]);
    expect(head?.facts.map((fact) => `${fact.label} ${fact.value}`)).toEqual(['open 1', 'done 1', 'tokens 0', 'span not started']);
  });
});

describe('changedTicketIdsBetween', () => {
  test('marks nothing on the first board, then the new tickets and the tickets whose display state moved', () => {
    const before = exampleTicketsBoard({ tickets: [exampleTicketsTicket('001'), exampleTicketsTicket('002')] });
    const after = exampleTicketsBoard({
      tickets:       [exampleTicketsTicket('001'), exampleTicketsTicket('002'), exampleTicketsTicket('003')],
      displayStates: { '002': 'in-progress' },
    });

    expect([...TicketsModel.changedTicketIdsBetween(null, after)]).toEqual([]);
    expect([...TicketsModel.changedTicketIdsBetween(before, after)]).toEqual(['002', '003']);
  });
});

describe('hiddenWorkTextOf', () => {
  test('names the finished-work window the lead hides, and nothing while every ticket shows', () => {
    expect(TicketsModel.hiddenWorkTextOf('1d', false)).toBe('Closed tickets not finished in the last day are hidden. Search to see every ticket.');
    expect(TicketsModel.hiddenWorkTextOf('since-2026-09-24', false)).toBe('Closed tickets not finished since 09-24 are hidden. Search to see every ticket.');
    expect(TicketsModel.hiddenWorkTextOf('all', false)).toBeNull();
    expect(TicketsModel.hiddenWorkTextOf('1d', true)).toBeNull();
  });
});

describe('the priority', () => {
  test('a row marks the priority the forge resolved, not the one filed', () => {
    const filedLow = exampleTicketsTicket('001', { priority: 'low' });
    const board = exampleTicketsBoard({ tickets: [{ ...filedLow, facts: { ...filedLow.facts, resolvedPriority: 'high' } }] });
    expect(TicketsModel.ticketsModelOf(board, DEFAULT_TICKET_VIEW, false, EVERY_TICKET).groups[0]?.rows[0]?.priority).toBe('high');
  });

  test('Flint\'s tickets habitat reads each ticket with its resolved priority', () => {
    const unfiled = exampleTicketsTicket('001', { hold: 'Example hold', dependsOn: ['002'] });
    const cued = TicketsModel.cuedTicketsOf([{ ...unfiled, facts: { ...unfiled.facts, resolvedPriority: 'low' } }]);
    expect(cued).toEqual([{
      id: '001', status: 'committed', resolvedPriority: 'low', hold: 'Example hold', dependsOn: ['002'], foundInReview: null, introducedBy: null
    }]);
  });

  test('Flint\'s tickets habitat reads the review that found a ticket and the ticket a bug names as its source', () => {
    const cued = TicketsModel.cuedTicketsOf([
      exampleTicketsTicket('002', { foundInReview: '001' }),
      exampleTicketsTicket('003', { introducedBy: '001' }),
    ]);
    expect(cued).toMatchObject([
      { id: '002', foundInReview: '001', introducedBy: null },
      { id: '003', foundInReview: null, introducedBy: '001' },
    ]);
  });
});
