/**
 * The Tickets view in a happy-dom document: segment counts, which segment opens and its per-forge storage, each segment's rows and actions, a search
 * per segment, and planted titles kept as text.
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

import type { BoardDocument }                                 from '../../../@types/board/BoardDocument.ts';
import { boardPreferenceStoreOf }                             from '../../preferences/PreferenceStore.ts';
import { FinishedWorkWindowContext, type FinishedWorkWindow } from '../../shared/FinishedWorkWindow.ts';
import { boardHrefOf }                                        from '../../testing/BoardRouteSurroundings.tsx';
import {
  exampleAgentJob,
  exampleAskingDecision,
  FIXTURE_NOW,
  FIXTURE_TRACKER_ID
} from '../../testing/BoardStateFixture.ts';
import { routedOnTab, type RoutedView } from '../../testing/DetailRoutingFixture.ts';
import { productOwnerJob }              from '../../testing/IntakeBoardFixture.ts';
import {
  exampleDocumentQuestion,
  exampleDocumentsSummary,
  exampleDraft,
  exampleTicketsBoard,
  exampleTicketsTicket
} from '../../testing/TicketsBoardFixture.ts';
import { TicketsView } from './TicketsView.tsx';

const PLANTED_TITLE = '<img src=x onerror="window.plantedRan = true">';

const SEGMENT_KEY = `gaia:board:${FIXTURE_TRACKER_ID}:tickets-segment`;

const WRITING_AND_FINISHED = [
  exampleTicketsTicket('23', {
    title:     'Address autocomplete',
    status:    'draft',
    documents: exampleDocumentsSummary(['drafting', 1]),
    draft:     exampleDraft({
      stage: 'spec',
      agent: {
        jobId: 'J9', role: 'spec-agent', tokens: 18_000, since: '2026-10-29T11:55:48'
      }
    }),
  }),
  exampleTicketsTicket('12', { title: 'Checkout address form', status: 'in-progress' }),
  exampleTicketsTicket('16', { title: PLANTED_TITLE }),
  exampleTicketsTicket('10', { title: 'Wishlist sharing', status: 'delivered', delivered: '2026-10-29T11:05:00' }),
  exampleTicketsTicket('3', { title: 'Size guide modal', status: 'delivered', delivered: '2026-10-20T10:00:00' }),
];

/** Nothing waits on User: a spec agent writes #23. */
const QUIET_BOARD = exampleTicketsBoard({
  tickets: WRITING_AND_FINISHED,
  jobs:    [exampleAgentJob({ id: 'J2', ticketIds: ['12'] })],
});

/** #22's spec agent asks User, and an intake runs and asks User. */
const WAITING_BOARD = exampleTicketsBoard({
  tickets: [
    exampleTicketsTicket('22', {
      title:     'Order email footer links',
      status:    'draft',
      documents: exampleDocumentsSummary(['drafting', 2]),
      draft:     exampleDraft({ stage: 'spec', waitsOnUser: 'answer', waitingSince: '2026-10-29T11:54:00' }),
    }),
    ...WRITING_AND_FINISHED,
  ],
  jobs: [
    exampleAgentJob({ id: 'J2', ticketIds: ['12'] }),
    productOwnerJob({
      id: 'J8', state: 'running', intake: { text: 'Account area changes', title: 'Account area changes' }, launchedAt: '2026-10-29T11:51:00'
    }),
  ],
  decisions: [exampleDocumentQuestion('E7', '22', 'spec', '2026-10-29T11:54:00'), exampleAskingDecision({ id: 'E5', jobId: 'J8', askedBy: 'product-owner' })],
});

interface RenderedTickets {
  readonly storage:   Map<string, string>;
  readonly routed:    RoutedView;
  readonly showAsked: { count: number };
  /** Draws the view again on another route item, as the shell does when the address moves under a mounted view. */
  readonly routeTo:   (routeItem: string | null) => void;
}

function renderTickets(board: BoardDocument, storedEntries: readonly [string, string][] = [], routeItem: string | null = null): RenderedTickets {
  const storage = new Map<string, string>(storedEntries);
  const boardStore = boardPreferenceStoreOf(FIXTURE_TRACKER_ID, () => ({
    getItem:    (key) => storage.get(key) ?? null,
    setItem:    (key, value) => storage.set(key, value),
    removeItem: (key) => storage.delete(key),
  }));
  const showAsked = { count: 0 };
  const finishedWorkWindow: FinishedWorkWindow = {
    choice:                  '1d',
    cutoffEpochMilliseconds: FIXTURE_NOW.getTime() - 86_400_000,
    nowEpochMilliseconds:    FIXTURE_NOW.getTime(),
    showAll:                 () => {
      showAsked.count += 1;
    },
  };
  const elementOn = (item: string | null) => (
    <FinishedWorkWindowContext value={finishedWorkWindow}>
      {routedOnTab('tickets', <TicketsView board={board} boardStore={boardStore} routeItem={item} />).element}
    </FinishedWorkWindowContext>
  );
  const routed = routedOnTab('tickets', <TicketsView board={board} boardStore={boardStore} routeItem={routeItem} />);
  const { rerender } = render(<FinishedWorkWindowContext value={finishedWorkWindow}>{routed.element}</FinishedWorkWindowContext>);
  return {
    storage, routed, showAsked, routeTo: (item) => act(() => rerender(elementOn(item)))
  };
}

function segmentButton(name: RegExp): HTMLElement {
  return within(screen.getByRole('group', { name: 'Which tickets' })).getByRole('button', { name });
}

function pressedSegment(): string | null {
  return within(screen.getByRole('group', { name: 'Which tickets' })).getAllByRole('button').find((button) => button.getAttribute('aria-pressed') === 'true')?.textContent ?? null;
}

function clicked(element: HTMLElement): void {
  act(() => {
    fireEvent.click(element);
  });
}

function typed(searchName: string, text: string): void {
  act(() => {
    fireEvent.change(screen.getByRole('searchbox', { name: searchName }), { target: { value: text } });
  });
}

afterEach(() => {
  cleanup();
});

describe('the segments', () => {
  test('show their counts, In draft\'s accented while something there waits on User', () => {
    renderTickets(WAITING_BOARD);
    expect([segmentButton(/^In draft/).textContent, segmentButton(/^Active/).textContent, segmentButton(/^Finished/).textContent])
      .toEqual(['In draft 2', 'Active 2', 'Finished 2']);
    expect(segmentButton(/^In draft/).getAttribute('aria-label')).toBe('In draft, 2, something waits on you');
  });

  test('the view opens on In draft while something there waits, whatever was stored', () => {
    renderTickets(WAITING_BOARD, [[SEGMENT_KEY, 'finished']]);
    expect(pressedSegment()).toBe('In draft 2');
  });

  test('with nothing waiting it opens on the stored segment, and a routed segment wins over both', () => {
    renderTickets(QUIET_BOARD, [[SEGMENT_KEY, 'active']]);
    expect(pressedSegment()).toBe('Active 2');
    cleanup();
    renderTickets(WAITING_BOARD, [[SEGMENT_KEY, 'active']], 'finished');
    expect(pressedSegment()).toBe('Finished 2');
  });

  test('a segment the address names while the view is open is shown, and a detail item keeps the segment', () => {
    const { routeTo } = renderTickets(QUIET_BOARD);
    routeTo('active');
    expect(pressedSegment()).toBe('Active 2');
    routeTo('ticket/12');
    expect(pressedSegment()).toBe('Active 2');
  });

  test('a choice moves an address that names a segment to the one chosen, and leaves an address naming none', () => {
    const { routed } = renderTickets(QUIET_BOARD, [], 'in-draft');
    clicked(segmentButton(/^Finished/));
    expect(routed.followedFragments).toEqual([boardHrefOf('tickets/finished')]);
    cleanup();
    const unnamed = renderTickets(QUIET_BOARD);
    clicked(segmentButton(/^Finished/));
    expect(unnamed.routed.followedFragments).toEqual([]);
  });

  test('a choice is stored per forge, and In draft, the default, removes the key', () => {
    const { storage } = renderTickets(QUIET_BOARD);
    clicked(segmentButton(/^Finished/));
    expect(storage.get(SEGMENT_KEY)).toBe('finished');
    clicked(segmentButton(/^In draft/));
    expect(storage.has(SEGMENT_KEY)).toBe(false);
  });
});

describe('In draft', () => {
  test('draws the running intake first, linking to its session in Intake', () => {
    renderTickets(WAITING_BOARD);
    const intake = screen.getByRole('region', { name: 'Intake Account area changes' });
    expect(within(intake).getByText('Waiting on you · 1 question')).toBeDefined();
    expect(within(intake).getByRole('link', { name: 'Open intake' }).getAttribute('href')).toBe(boardHrefOf('intake/J8'));
  });

  test('a draft waiting on User has its wait and an action opening its document, and its id opens the document too', () => {
    renderTickets(WAITING_BOARD);
    const waiting = screen.getByRole('region', { name: 'Waiting on you' });
    expect(within(waiting).getByText('1 question from the spec agent')).toBeDefined();
    expect(within(waiting).getByRole('link', { name: 'Answer #22' }).getAttribute('href')).toBe(boardHrefOf('documents/ticket/22/spec'));
    expect(within(waiting).getByRole('link', { name: '#22' }).getAttribute('href')).toBe(boardHrefOf('documents/ticket/22/spec'));
  });

  test('a draft an agent writes shows the agent and Watch opens its document', () => {
    renderTickets(QUIET_BOARD);
    const writing = screen.getByRole('region', { name: 'Agent writing' });
    expect(within(writing).getByText('J9')).toBeDefined();
    expect(within(writing).getByText('spec agent')).toBeDefined();
    expect(within(writing).getByRole('link', { name: 'Watch #23' }).getAttribute('href')).toBe(boardHrefOf('documents/ticket/23/spec'));
    expect(screen.queryByRole('region', { name: 'Waiting on you' })).toBeNull();
  });
});

describe('Active and Finished', () => {
  test('an Active row opens its ticket\'s detail by a click or Enter, and its id links there', () => {
    const { routed } = renderTickets(QUIET_BOARD, [], 'active');
    const row = document.querySelector('tr[data-ticket-id="12"]') as HTMLElement;
    expect(within(row).getByRole('link', { name: '#12' }).getAttribute('href')).toBe(boardHrefOf('tickets/ticket/12'));
    clicked(row);
    act(() => {
      fireEvent.keyDown(row, { key: 'Enter' });
    });
    expect(routed.navigatedRoutes).toEqual([{ tab: 'tickets', item: 'ticket/12' }, { tab: 'tickets', item: 'ticket/12' }]);
  });

  test('Finished shows the window\'s tickets and its show all widens the window', () => {
    const { showAsked } = renderTickets(QUIET_BOARD, [], 'finished');
    const finished = screen.getByRole('region', { name: 'Finished tickets' });
    expect(within(finished).getByText('Wishlist sharing')).toBeDefined();
    expect(within(finished).queryByText('Size guide modal')).toBeNull();
    expect(within(finished).getByText(/1 earlier ticket/)).toBeDefined();
    clicked(within(finished).getByRole('button', { name: 'show all' }));
    expect(showAsked.count).toBe(1);
  });
});

test('In draft says the search matched no draft while an intake, which no search hides, still shows', () => {
  renderTickets(WAITING_BOARD);
  typed('Search in draft', 'zzz');
  expect(screen.getByRole('region', { name: 'Intake Account area changes' })).toBeDefined();
  expect(screen.getByText('No draft matches the search.')).toBeDefined();
});

test('each segment keeps its own search', () => {
  renderTickets(QUIET_BOARD, [], 'active');
  typed('Search active', 'checkout');
  expect(screen.getByText('Checkout address form')).toBeDefined();
  expect(document.querySelector('tr[data-ticket-id="16"]')).toBeNull();
  clicked(segmentButton(/^Finished/));
  expect((screen.getByRole('searchbox', { name: 'Search finished' }) as HTMLInputElement).value).toBe('');
  clicked(segmentButton(/^Active/));
  expect((screen.getByRole('searchbox', { name: 'Search active' }) as HTMLInputElement).value).toBe('checkout');
});

test('a planted payload in a title reaches the DOM only as text', () => {
  renderTickets(QUIET_BOARD, [], 'active');
  expect(screen.getByText(PLANTED_TITLE)).toBeDefined();
  expect(document.querySelector('img')).toBeNull();
  expect((window as unknown as { plantedRan?: boolean }).plantedRan).toBeUndefined();
});

test('the view is a workplace of Flint', () => {
  renderTickets(QUIET_BOARD);
  expect(screen.getByRole('region', { name: 'Tickets' }).hasAttribute('data-flint-workplace')).toBe(true);
});
