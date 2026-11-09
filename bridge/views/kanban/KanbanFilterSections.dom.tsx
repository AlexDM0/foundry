/**
 * The filter menu's Kanban sections, composed as the shell composes them: the choices hook, the filter line and menu, and the board. What
 * matters: an Epic row narrows the board, stores the pressed rows under their key, shows the pressed epic's roll-up under its row and names
 * it in the filter line; the no-epic row reads "no epic"; Order Ready shows only on a board with dependencies, with its hint, orders the
 * Ready lane by wave and stores that; and "Reset filters" releases every row and files the Ready lane again, clearing both keys.
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

import { PRODUCT_NAMES }                                from '../../../src/shared/constants/ProductNames.ts';
import type { EpicRollupDocument }                      from '../../@types/BoardStateDocument.ts';
import type { KanbanBoardState }                        from '../../@types/KanbanBoardState.ts';
import { boardPreferenceStoreOf, type PreferenceStore } from '../../preferences/PreferenceStore.ts';
import { FinishedWorkFilter, useFinishedWorkChoice }    from '../../shell/FinishedWorkFilter.tsx';
import { routedOnTab }                                  from '../../testing/DetailRoutingFixture.ts';
import { EXAMPLE_NOW_EPOCH_MILLISECONDS }               from '../../testing/KanbanBoardFixture.ts';
import { exampleBoard, exampleTicket }                  from '../../testing/KanbanBoardFixture.ts';
import { EXAMPLE_PAGE_LIMITS }                          from '../../testing/TimestampSlicesFixture.ts';
import { useKanbanFilterChoices }                       from './KanbanFilterChoices.ts';
import { KanbanFilterSections }                         from './KanbanFilterSections.tsx';
import { KanbanModel }                                  from './KanbanModel.ts';
import { KanbanView }                                   from './KanbanView.tsx';

const EPICS_KEY = `${PRODUCT_NAMES.STORAGE_PREFIX}:example-tracker:kanban-epics`;
const ORDER_KEY = `${PRODUCT_NAMES.STORAGE_PREFIX}:example-tracker:kanban-todo-order`;

const BOARD = exampleBoard({
  tickets: [
    exampleTicket('001', { epics: ['checkout'] }),
    exampleTicket('002', { epics: ['billing'], dependsOn: ['001'] }),
    exampleTicket('003', { dependsOn: ['002'] }),
  ],
});

const CHECKOUT_ROLLUP: EpicRollupDocument = {
  key: 'checkout', title: 'Example checkout', slot: 2, ticketIds: ['001'], ticketCountByStatus: { pending: 1 }, tokens: 1_200, span: null,
};

function storeOver(storage: Map<string, string>): PreferenceStore {
  return boardPreferenceStoreOf('example-tracker', () => ({
    getItem:    (key) => storage.get(key) ?? null,
    setItem:    (key, value) => storage.set(key, value),
    removeItem: (key) => storage.delete(key),
  }));
}

function KanbanWithFilters({ board, store }: { readonly board: KanbanBoardState; readonly store: PreferenceStore }) {
  const [choice, choose] = useFinishedWorkChoice(store);
  const choices = useKanbanFilterChoices(store);
  const { storedPressedChips, storedReadyOrder } = choices;
  const filters = useMemo(() => KanbanModel.kanbanFilterModelOf(board, storedPressedChips, storedReadyOrder), [board, storedPressedChips, storedReadyOrder]);
  return (
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
      {routedOnTab('kanban', (
        <KanbanView
          boardState={board}
          filters={filters}
          boardStore={store}
          streamIsLive
          mergeQueueHref="#kanban/merge-queue"
          onShowAllFinished={() => undefined}
        />
      )).element}
    </>
  );
}

function renderKanbanWithFilters(board: KanbanBoardState = BOARD): Map<string, string> {
  const storage = new Map<string, string>();
  render(<KanbanWithFilters board={board} store={storeOver(storage)} />);
  act(() => {
    fireEvent.click(document.querySelector('.bridge-filter-line') ?? document.body);
  });
  return storage;
}

function clicked(element: HTMLElement): void {
  act(() => {
    fireEvent.click(element);
  });
}

function readyCardIds(): (string | null)[] {
  return [...screen.getByRole('region', { name: 'Ready' }).querySelectorAll('.bridge-ticket-id')].map((id) => id.textContent);
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
    expect(document.querySelector('.bridge-epic-strip-rollup')?.textContent).toBe('0 of 1 done · 1.2k tokensExample checkout details');
    expect(document.querySelector('.bridge-filter-epic-name')?.textContent).toBe('Example checkout');
  });
});

describe('the Order Ready section', () => {
  test('orders the Ready lane by wave with its hint, and stores the order', () => {
    const storage = renderKanbanWithFilters();
    expect(screen.getByText('↦ N on a card: tickets that wait on it, directly or further down the chain.')).toBeTruthy();
    clicked(within(screen.getByRole('group', { name: 'Order Ready' })).getByRole('button', { name: 'by wave' }));
    expect(document.querySelectorAll('.bridge-lane-wave').length).toBe(3);
    expect(storage.get(ORDER_KEY)).toBe('by-wave');
  });

  test('a board without dependencies has no Order Ready section', () => {
    renderKanbanWithFilters(exampleBoard({ tickets: [exampleTicket('001', { epics: ['checkout'] })] }));
    expect(screen.queryByRole('group', { name: 'Order Ready' })).toBeNull();
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
    expect(document.querySelector('.bridge-filter-epic')).toBeNull();
  });
});
