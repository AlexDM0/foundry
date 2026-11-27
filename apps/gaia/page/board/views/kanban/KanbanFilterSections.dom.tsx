/**
 * The filter menu's Kanban sections, composed as the shell composes them: each row narrows or orders the board and stores its choice
 * under its key, the rows show only where they apply, and "Reset filters" releases every row and clears every key.
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
import { useMemo } from 'react';

import type { BoardDocument }                           from '../../../@types/board/BoardDocument.ts';
import type { BoardEpicDocument }                       from '../../../@types/board/BoardTicketDocuments.ts';
import { boardPreferenceStoreOf, type PreferenceStore } from '../../preferences/PreferenceStore.ts';
import { FinishedWorkFilter, useFinishedWorkChoice }    from '../../shell/FinishedWorkFilter.tsx';
import { ticketCountByStatusOf }                        from '../../testing/BoardStateFixture.ts';
import { routedOnTab }                                  from '../../testing/DetailRoutingFixture.ts';
import { EXAMPLE_NOW_EPOCH_MILLISECONDS }               from '../../testing/KanbanBoardFixture.ts';
import { exampleBoard, exampleTicket }                  from '../../testing/KanbanBoardFixture.ts';
import { EXAMPLE_PAGE_LIMITS }                          from '../../testing/TimestampSlicesFixture.ts';
import { useKanbanFilterChoices }                       from './KanbanFilterChoices.ts';
import { KanbanFilterSections }                         from './KanbanFilterSections.tsx';
import { KanbanModel }                                  from './KanbanModel.ts';
import { KanbanView }                                   from './KanbanView.tsx';

const EPICS_KEY = 'gaia:board:example-tracker:kanban-epics';
const ORDER_KEY = 'gaia:board:example-tracker:kanban-todo-order';
const ENTITY_KEY = 'gaia:board:example-tracker:kanban-entity';
const SWIMLANES_KEY = 'gaia:board:example-tracker:kanban-swimlanes';

const MONOREPO_BOARD = exampleBoard({
  filingDrafts: [],
  tickets:      [exampleTicket('001'), exampleTicket('002')],
  entities:     { 'web': { kind: 'app' }, 'example-ui': { kind: 'package' } },
  entityById:   { '001': 'web', '002': 'example-ui' },
});

const BOARD = exampleBoard({
  filingDrafts: [],
  tickets:      [
    exampleTicket('001', { epics: ['checkout'] }),
    exampleTicket('002', { epics: ['billing'], dependsOn: ['001'] }),
    exampleTicket('003', { dependsOn: ['002'] }),
  ],
});

const CHECKOUT_ROLLUP: BoardEpicDocument = {
  key: 'checkout', title: 'Example checkout', slot: 2, ticketIds: ['001'], ticketCountByStatus: ticketCountByStatusOf({ committed: 1 }), tokens: 1_200, span: null,
};

function storeOver(storage: Map<string, string>): PreferenceStore {
  return boardPreferenceStoreOf('example-tracker', () => ({
    getItem:    (key) => storage.get(key) ?? null,
    setItem:    (key, value) => storage.set(key, value),
    removeItem: (key) => storage.delete(key),
  }));
}

function KanbanWithFilters({ board, store }: { readonly board: BoardDocument; readonly store: PreferenceStore }) {
  const [choice, choose] = useFinishedWorkChoice(store);
  const choices = useKanbanFilterChoices(store);
  const {
    storedPressedChips, storedReadyOrder, storedEntity, storedSwimlanes
  } = choices;
  const filters = useMemo(
    () => KanbanModel.kanbanFilterModelOf(board, storedPressedChips, storedReadyOrder, storedEntity, storedSwimlanes),
    [board, storedPressedChips, storedReadyOrder, storedEntity, storedSwimlanes],
  );
  return routedOnTab('kanban', (
    <>
      <FinishedWorkFilter
        choice={choice}
        onChoice={choose}
        tickets={[]}
        epics={[]}
        counted={{ noun: 'ticket', finishedMoments: [] }}
        nowEpochMilliseconds={EXAMPLE_NOW_EPOCH_MILLISECONDS}
        durationUnits={EXAMPLE_PAGE_LIMITS}
        tabSections={<KanbanFilterSections filters={filters} choices={choices} epicRollups={[CHECKOUT_ROLLUP]} />}
        lineEpic={filters.lineEpic}
        onResetTabFilters={choices.reset}
      />
      <KanbanView
        board={board}
        filters={filters}
        boardStore={store}
        streamIsLive
        mergeQueueHref="#forge/example-tracker/progress/kanban/merge-queue"
        draftsWaitingCount={0}
        ticketsHref="#forge/example-tracker/tickets"
        onShowAllFinished={() => undefined}
        onChooseEntity={choices.chooseEntity}
      />
    </>
  )).element;
}

function renderKanbanWithFilters(board: BoardDocument = BOARD): Map<string, string> {
  const storage = new Map<string, string>();
  render(<KanbanWithFilters board={board} store={storeOver(storage)} />);
  act(() => {
    fireEvent.click(document.querySelector('.board-filter-line') ?? document.body);
  });
  return storage;
}

function clicked(element: HTMLElement): void {
  act(() => {
    fireEvent.click(element);
  });
}

function readyCardIds(): (string | null)[] {
  return [...screen.getByRole('region', { name: 'Ready' }).querySelectorAll('.design-system-mono-id')].map((id) => id.textContent);
}

afterEach(() => {
  cleanup();
});

describe('the Epic section', () => {
  test('an epic row narrows the board, stores the pressed rows, shows its roll-up and is named in the filter line', () => {
    const storage = renderKanbanWithFilters();
    const rows = within(screen.getByRole('group', { name: 'Epic' }));
    expect(rows.getAllByRole('button').map((row) => row.textContent)).toEqual(['Example checkout 1', 'Example billing 1', 'no epic 1']);
    clicked(rows.getByRole('button', { name: /Example checkout/u }));
    expect(readyCardIds()).toEqual(['#001']);
    expect(storage.get(EPICS_KEY)).toBe('["checkout"]');
    expect(document.querySelector('.board-epic-strip-rollup')?.textContent).toBe('0 of 1 done · 1.2k tokensExample checkout details');
    expect(document.querySelector('.board-filter-epic-name')?.textContent).toBe('Example checkout');
  });
});

describe('the Order Ready section', () => {
  test('orders the Ready lane by wave with its hint, and stores the order', () => {
    const storage = renderKanbanWithFilters();
    expect(screen.getByText('↦ N on a card: tickets that wait on it, directly or further down the chain.')).toBeTruthy();
    clicked(within(screen.getByRole('group', { name: 'Order Ready' })).getByRole('button', { name: 'by wave' }));
    expect(document.querySelectorAll('.board-lane-wave').length).toBe(3);
    expect(storage.get(ORDER_KEY)).toBe('by-wave');
  });

  test('a board without dependencies has no Order Ready section', () => {
    renderKanbanWithFilters(exampleBoard({ tickets: [exampleTicket('001', { epics: ['checkout'] })] }));
    expect(screen.queryByRole('group', { name: 'Order Ready' })).toBeNull();
  });
});

describe('the Swimlanes section', () => {
  test('a board without entities has no Swimlanes section', () => {
    renderKanbanWithFilters();
    expect(screen.queryByRole('group', { name: 'Swimlanes' })).toBeNull();
  });

  test('in monorepo mode, turns the entity heads off and stores that', () => {
    const storage = renderKanbanWithFilters(MONOREPO_BOARD);
    expect(document.querySelectorAll('[data-swimlane]').length).toBe(2);
    clicked(within(screen.getByRole('group', { name: 'Swimlanes' })).getByRole('button', { name: 'none' }));
    expect(document.querySelectorAll('[data-swimlane]').length).toBe(0);
    expect(storage.get(SWIMLANES_KEY)).toBe('none');
  });
});

describe('Reset filters', () => {
  test('releases every epic row and files the Ready lane again, clearing both keys', () => {
    const storage = renderKanbanWithFilters();
    clicked(within(screen.getByRole('group', { name: 'Epic' })).getByRole('button', { name: /Example billing/u }));
    clicked(within(screen.getByRole('group', { name: 'Order Ready' })).getByRole('button', { name: 'by wave' }));
    clicked(screen.getByRole('button', { name: 'Reset filters' }));
    expect([storage.has(EPICS_KEY), storage.has(ORDER_KEY)]).toEqual([false, false]);
    expect(readyCardIds()).toEqual(['#001', '#002', '#003']);
    expect(document.querySelector('.board-filter-epic')).toBeNull();
  });

  test('in monorepo mode, also shows every entity and puts the swimlanes back by entity, clearing their keys', () => {
    const storage = renderKanbanWithFilters(MONOREPO_BOARD);
    clicked(within(screen.getByRole('region', { name: 'Kanban entities' })).getByRole('button', { name: /^web,/u }));
    clicked(within(screen.getByRole('group', { name: 'Swimlanes' })).getByRole('button', { name: 'none' }));
    expect([storage.get(ENTITY_KEY), readyCardIds()]).toEqual(['web', ['#001']]);
    clicked(screen.getByRole('button', { name: 'Reset filters' }));
    expect([storage.has(ENTITY_KEY), storage.has(SWIMLANES_KEY)]).toEqual([false, false]);
    expect(readyCardIds()).toEqual(['#001', '#002']);
  });
});
