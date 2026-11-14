/**
 * The Tickets view in a happy-dom document: the title row's heading and its lead, which names what the finished-work window hides; the
 * table newest first, each id linking to its detail panel and a click, Enter or Space on a
 * row opening its row form while a link inside it stays its own; the open row marked; the finished-work window hiding old closed tickets
 * until something narrows; typing a search narrows the table and marks the match, an id query marking nothing; the type, epic and status
 * chips narrow as OR inside a group and AND across, with their counts; the empty table says what was asked and its Clear restores every
 * row and returns to the search; a header sorts and reverses; grouping by epic is stored under its key; a planted title stays text; after a
 * board update a moved or new row is marked changed once, until its highlight has played.
 */
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within
} from '@testing-library/react';
import {
  afterEach,
  describe,
  expect,
  test
} from 'bun:test';

import { PRODUCT_NAMES }                             from '../../../src/shared/constants/ProductNames.ts';
import { boardPreferenceStoreOf }                    from '../../preferences/PreferenceStore.ts';
import type { DetailItem }                           from '../../shell/DetailRoute.ts';
import { FinishedWorkWindowContext }                 from '../../shell/FinishedWorkWindow.ts';
import { routedOnTab, type RoutedView }              from '../../testing/DetailRoutingFixture.ts';
import { exampleTicketsBoard, exampleTicketsTicket } from '../../testing/TicketsBoardFixture.ts';
import { TicketsView }                               from './TicketsView.tsx';

const PLANTED_TITLE = '<img src=x onerror="window.plantedRan = true">';

const BOARD = exampleTicketsBoard({
  tickets: [
    exampleTicketsTicket('001', {
      title: 'Add dark mode', branch: 'ticket-001', status: 'delivered', delivered: '2026-09-01T10:00:00+02:00', task: 3
    }),
    exampleTicketsTicket('002', {
      title: 'Fix the export', type: 'bug', epics: ['billing'], priority: 'high'
    }),
    exampleTicketsTicket('003', { title: 'Research a vendor', type: 'research', epics: ['checkout'] }),
    exampleTicketsTicket('004', { title: PLANTED_TITLE, status: 'in-progress' }),
  ],
  waitingOn: { '003': ['002'] },
});

const GROUPING_KEY = `${PRODUCT_NAMES.STORAGE_PREFIX}:example-tracker:ticket-grouping`;

/** Closed tickets from the last day show; #001 closed weeks before. */
const LAST_DAY_WINDOW = {
  choice:                  '1d',
  cutoffEpochMilliseconds: Date.parse('2026-09-17T12:00:00+02:00'),
  nowEpochMilliseconds:    Date.parse('2026-09-18T12:00:00+02:00'),
} as const;

interface RenderedTickets {
  readonly storage: Map<string, string>;
  readonly routed:  RoutedView;
}

function renderTickets(storedEntries: readonly [string, string][] = [], openItem: DetailItem | null = null, insideLastDayWindow = false): RenderedTickets {
  const storage = new Map<string, string>(storedEntries);
  const boardStore = boardPreferenceStoreOf('example-tracker', () => ({
    getItem:    (key) => storage.get(key) ?? null,
    setItem:    (key, value) => storage.set(key, value),
    removeItem: (key) => storage.delete(key),
  }));
  const routed = routedOnTab('tickets', <TicketsView boardState={BOARD} boardStore={boardStore} />, openItem);
  render(insideLastDayWindow ? <FinishedWorkWindowContext.Provider value={LAST_DAY_WINDOW}>{routed.element}</FinishedWorkWindowContext.Provider> : routed.element);
  return { storage, routed };
}

function shownIds(): (string | null)[] {
  return [...document.querySelectorAll('tbody tr[data-ticket-id]')].map((row) => row.getAttribute('data-ticket-id'));
}

function idLinkOf(ticketId: string): HTMLElement {
  return document.querySelector(`tr[data-ticket-id="${ticketId}"] td:first-child a`) as HTMLElement;
}

function chipNamed(group: string, name: RegExp): HTMLElement {
  return within(screen.getByRole('group', { name: group })).getByRole('button', { name });
}

function typed(text: string): void {
  act(() => {
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search tickets' }), { target: { value: text } });
  });
}

function clicked(element: HTMLElement): void {
  act(() => {
    fireEvent.click(element);
  });
}

afterEach(() => {
  cleanup();
});

describe('the table', () => {
  test('shows every ticket newest first, each id linking to its detail panel, with the count', () => {
    renderTickets();
    expect(shownIds()).toEqual(['004', '003', '002', '001']);
    expect(idLinkOf('002').getAttribute('href')).toBe('#tickets/ticket-row/002');
    expect(screen.getByText('4 of 4 tickets · 1 in progress')).toBeTruthy();
  });

  test('a row shows its state badge, priority, type, epics, waiting-on links and its task by the ticket\'s own id', () => {
    renderTickets();
    const row = document.querySelector('tr[data-ticket-id="002"]');
    expect(row?.querySelector('.design-system-state-badge')?.textContent).toBe('To do');
    expect(row?.querySelector('.bridge-priority-mark')?.textContent).toBe('high');
    expect(row?.querySelector('.bridge-type-mark')?.textContent).toBe('bug');
    expect(document.querySelector('tr[data-ticket-id="004"] .bridge-type-mark')?.textContent).toBe('ticket');
    expect(row?.querySelector('.bridge-epic-chip')?.textContent).toBe('Example billing');
    const waiting = document.querySelector('tr[data-ticket-id="003"] .bridge-waiting-on');
    expect([waiting?.textContent, waiting?.querySelector('a')?.getAttribute('href')]).toEqual(['waiting on #002', '#tickets/ticket-row/002']);
    const task = document.querySelector('tr[data-ticket-id="001"] td:last-child a');
    expect([task?.textContent, task?.getAttribute('href')]).toEqual(['#001', '#progress/task-row/3']);
  });

  test('a click, Enter or Space on a row opens its row form, and a link inside the row stays its own', () => {
    const { routed } = renderTickets();
    const row = document.querySelector('tr[data-ticket-id="003"]') as HTMLElement;
    clicked(row);
    act(() => {
      fireEvent.keyDown(row, { key: 'Enter' });
      fireEvent.keyDown(row, { key: ' ' });
    });
    clicked(idLinkOf('002'));
    expect(routed.navigatedRoutes).toEqual([
      { tab: 'tickets', item: 'ticket-row/003' }, { tab: 'tickets', item: 'ticket-row/003' }, { tab: 'tickets', item: 'ticket-row/003' },
    ]);
  });

  test('the row the panel shows is marked, and its opener closes it', () => {
    renderTickets([], { form: 'ticket-row', ticketId: '002' });
    expect([...document.querySelectorAll('tr[data-selected]')].map((row) => row.getAttribute('data-ticket-id'))).toEqual(['002']);
    expect(idLinkOf('002').getAttribute('href')).toBe('#tickets');
  });

  test('a planted payload in a title reaches the DOM only as text', () => {
    renderTickets();
    expect(document.querySelector('tr[data-ticket-id="004"] td:nth-child(2)')?.textContent).toBe(PLANTED_TITLE);
    expect(document.querySelector('tbody img')).toBeNull();
    expect((window as unknown as { plantedRan?: boolean }).plantedRan).toBeUndefined();
  });
});

describe('the finished-work window', () => {
  test('unnarrowed, a ticket closed before the window hides; a search looks through it again', () => {
    renderTickets([], null, true);
    expect(shownIds()).toEqual(['004', '003', '002']);
    expect(screen.getByText('3 of 4 tickets · 1 in progress')).toBeTruthy();
    typed('dark');
    expect(shownIds()).toEqual(['001']);
  });

  test('the title row heads the view and its lead names what the window hides, until a search looks through every ticket', () => {
    renderTickets([], null, true);
    expect(screen.getByRole('heading', { level: 2, name: 'Tickets' })).toBeTruthy();
    const lead = screen.getByText('3 of 4 tickets · 1 in progress').parentElement;
    expect(lead?.textContent).toBe('3 of 4 tickets · 1 in progress. Closed tickets not finished in the last day are hidden. Search to see every ticket.');
    typed('dark');
    expect(lead?.textContent).toBe('1 of 4 tickets · 1 in progress.');
  });
});

describe('the search', () => {
  test('typing narrows the table and marks each match in the title and branch', () => {
    renderTickets();
    typed('DARK');
    expect(shownIds()).toEqual(['001']);
    expect([...document.querySelectorAll('mark.bridge-match')].map((mark) => mark.textContent)).toEqual(['dark']);
    expect(screen.getByText('1 of 4 tickets · 1 in progress')).toBeTruthy();
  });

  test('an id query looks at the id alone and marks nothing', () => {
    renderTickets();
    typed('#1');
    expect(shownIds()).toEqual(['001']);
    expect(document.querySelectorAll('mark').length).toBe(0);
  });
});

describe('the chips', () => {
  test('type chips are alternatives, and their counts ignore their own group', () => {
    renderTickets();
    clicked(chipNamed('Type', /^bug/));
    clicked(chipNamed('Type', /^research/));
    expect(shownIds()).toEqual(['003', '002']);
    expect(chipNamed('Type', /^ticket/).querySelector('.bridge-chip-count')?.textContent).toBe('2');
    expect(chipNamed('Type', /^bug/).getAttribute('aria-pressed')).toBe('true');
  });

  test('an epic chip and a status chip hold together, and the no-epic chip keeps the tickets in none', () => {
    renderTickets();
    clicked(chipNamed('Epic', /^no epic/));
    expect(shownIds()).toEqual(['004', '001']);
    clicked(chipNamed('Status', /^In progress/));
    expect(shownIds()).toEqual(['004']);
  });

  test('a table nothing matches says what was asked, and its Clear brings every row back', () => {
    renderTickets();
    typed('nothing like it');
    clicked(chipNamed('Type', /^bug/));
    expect(shownIds()).toEqual([]);
    const empty = document.querySelector('.bridge-ticket-empty');
    expect(empty?.querySelector('p strong')?.textContent).toBe('No ticket matches “nothing like it”, type bug.');
    clicked(within(empty as HTMLElement).getByRole('button', { name: 'Clear search and filters' }));
    expect(shownIds()).toEqual(['004', '003', '002', '001']);
    expect(screen.queryByRole('button', { name: 'Clear search and filters' })).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole('searchbox', { name: 'Search tickets' }));
  });
});

describe('the sort and the grouping', () => {
  test('a header sorts ascending, marks itself sorted, and a second press reverses it', () => {
    renderTickets();
    const titleButton = screen.getByRole('button', { name: 'title' });
    clicked(titleButton);
    expect(shownIds()).toEqual(['004', '001', '002', '003']);
    expect(titleButton.closest('th')?.getAttribute('aria-sort')).toBe('ascending');
    expect(screen.getByRole('button', { name: 'id' }).closest('th')?.hasAttribute('aria-sort')).toBe(false);
    clicked(titleButton);
    expect(shownIds()).toEqual(['003', '002', '001', '004']);
  });

  test('grouping by epic puts each epic\'s tickets under its head and stores the choice under its key', () => {
    const { storage } = renderTickets();
    clicked(screen.getByRole('button', { name: 'Group by epic' }));
    expect([...document.querySelectorAll('.bridge-ticket-epic-title')].map((title) => title.textContent)).toEqual(['Example billing', 'Example checkout', 'No epic']);
    expect(document.querySelector('.bridge-ticket-epic-title')?.getAttribute('href')).toBe('#epics/epic/billing');
    expect(storage.get(GROUPING_KEY)).toBe('epic');
    clicked(screen.getByRole('button', { name: 'Group by epic' }));
    expect(storage.has(GROUPING_KEY)).toBe(false);
  });

  test('a stored grouping is read back on render', () => {
    renderTickets([[GROUPING_KEY, 'epic']]);
    expect(screen.getByRole('button', { name: 'Group by epic' }).getAttribute('aria-pressed')).toBe('true');
    expect(document.querySelectorAll('.bridge-ticket-epic-head').length).toBe(3);
  });
});

describe('the change highlight', () => {
  test('marks nothing on the first board, then each moved or new row until its highlight has played', () => {
    const view = (boardState: typeof BOARD) => routedOnTab('tickets', <TicketsView boardState={boardState} boardStore={null} />).element;
    const { rerender } = render(view(BOARD));
    expect(document.querySelectorAll('tr[data-changed]')).toHaveLength(0);

    const movedBoard = exampleTicketsBoard({
      tickets: [
        ...BOARD.page.tickets.map((ticket) => (ticket.id === '002' ? { ...ticket, status: 'in-progress' as const } : ticket)),
        exampleTicketsTicket('005', { title: 'Example new ticket' }),
      ],
      waitingOn: { '003': ['002'] },
    });
    rerender(view(movedBoard));
    expect([...document.querySelectorAll('tr[data-changed]')].map((row) => row.getAttribute('data-ticket-id'))).toEqual(['005', '002']);

    const movedRow = document.querySelector('tr[data-ticket-id="002"]') as HTMLElement;
    fireEvent.animationEnd(movedRow.querySelector('td') as HTMLElement);
    expect(movedRow.hasAttribute('data-changed')).toBe(true);
    fireEvent.animationEnd(movedRow);
    expect(movedRow.hasAttribute('data-changed')).toBe(false);
    expect(document.querySelector('tr[data-ticket-id="005"]')?.hasAttribute('data-changed')).toBe(true);
  });
});
