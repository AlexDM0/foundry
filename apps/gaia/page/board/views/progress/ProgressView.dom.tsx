/**
 * The Progress tab in a happy-dom document. What matters: each row draws its bars where the model places them, through the style prop; the
 * review-rows choice draws a ticket's review rows above it, latest round first, and is stored under its key; the title row names the tab;
 * the range control above the chart presses Fit by default and the preset chosen, and the chosen range, a custom one included, survives a
 * reload for the same viewer; the wide-titles
 * choice is stored; on a board with epics the rows are grouped under head rows that fold and stay folded across a reload; a tick label
 * near the right edge sits left of its line; a row opens its row's detail in place while its number links to its ticket and an epic
 * head's name to its epic; a row finished before the finished-work window is not drawn, and a held range marks rows that changed under
 * it until a range is chosen again, even when they change back; after a board update a moved or new row is marked changed once, until its
 * highlight has played; a planted title shows as text; Save as the board's range posts the range shown, Fit as the automatic span; and
 * Clear… asks first, posts the scope chosen, and Cancel sends nothing.
 * The tab is a workplace of Flint.
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

import { PAGE_CONTRACT_VERSIONS }     from '../../../../src/shared/constants/PageContractVersions.ts';
import type { BoardDocument }         from '../../../@types/board/BoardDocument.ts';
import { boardPreferenceStoreOf }     from '../../preferences/PreferenceStore.ts';
import { ControlSurroundingsContext } from '../../shell/ControlAvailability.ts';
import { FinishedWorkWindowContext }  from '../../shell/FinishedWorkWindow.ts';
import { ticketCountByStatusOf }      from '../../testing/BoardStateFixture.ts';
import { routedOnTab }                from '../../testing/DetailRoutingFixture.ts';
import { fakeControlSurroundingsOf }  from '../../testing/FakeControlSurroundings.ts';
import {
  exampleProgressBoard,
  exampleProgressEpic,
  exampleProgressTask,
  exampleProgressTicket
} from '../../testing/ProgressBoardFixture.ts';
import { ProgressView } from './ProgressView.tsx';

const PLANTED_NAME = '<img src=x onerror="window.plantedRan = true">';
const BOARD_KEY = 'gaia:board:example-tracker';
const BOARD_COMMAND_VERSION = PAGE_CONTRACT_VERSIONS.gaiaBoardCommand;
const REVIEW_ROWS_KEY = `${BOARD_KEY}:review-rows`;

const BOARD = exampleProgressBoard({
  view: {
    kind: 'absolute', from: '2026-09-18T09:00:00+02:00', to: '2026-09-18T13:00:00+02:00', tickMinutes: null
  },
  tasks: [
    exampleProgressTask(1, {
      name: '#5 Build the example', status: 'delivered', ticket: '5', start: '2026-09-18T09:00:00+02:00', end: '2026-09-18T11:00:00+02:00'
    }),
    exampleProgressTask(2, {
      name: 'Review 2 #5', status: 'delivered', reviewOf: '5', start: '2026-09-18T11:00:00+02:00', end: '2026-09-18T11:30:00+02:00'
    }),
    exampleProgressTask(3, {
      name: 'Review 1 #5', status: 'delivered', reviewOf: '5', start: '2026-09-18T11:30:00+02:00', end: '2026-09-18T12:00:00+02:00'
    }),
    exampleProgressTask(4, { name: PLANTED_NAME }),
  ],
  rowFacts:   { 2: { reviewsTaskId: 1 }, 3: { reviewsTaskId: 1 } },
  tickets:    [exampleProgressTicket('5', { status: 'delivered' }), exampleProgressTicket('6', { dependsOn: ['5'] })],
  ticketRows: { 5: { ownTaskId: 1, reviewTaskIds: [2, 3] } },
});

function memoryBoardStore(storage = new Map<string, string>()) {
  return boardPreferenceStoreOf('example-tracker', () => ({
    getItem:    (key) => storage.get(key) ?? null,
    setItem:    (key, value) => storage.set(key, value),
    removeItem: (key) => storage.delete(key),
  }));
}

function renderProgress(boardState: BoardDocument = BOARD, storedEntries: Iterable<readonly [string, string]> = []) {
  const storage = new Map<string, string>(storedEntries);
  const boardStore = boardPreferenceStoreOf('example-tracker', () => ({
    getItem:    (key) => storage.get(key) ?? null,
    setItem:    (key, value) => storage.set(key, value),
    removeItem: (key) => storage.delete(key),
  }));
  const routed = routedOnTab(
    'gantt',
    <ProgressView board={boardState} boardStore={boardStore} nowEpochMilliseconds={Date.parse('2026-09-18T13:00:00+02:00')} todayCalendarDate="2026-09-18" />,
  );
  const rendered = render(routed.element);
  return { storage, container: rendered.container, navigatedRoutes: routed.navigatedRoutes };
}

function rowTaskIds(container: HTMLElement): (string | null)[] {
  return [...container.querySelectorAll('.board-progress-rows .board-progress-row')].map((row) => row.getAttribute('data-task-id'));
}

function openMenu(name: string): void {
  fireEvent.click(screen.getByRole('button', { name }));
}

function rangeControl(): HTMLElement {
  return screen.getByRole('group', { name: 'Range' });
}

function pressedRange(): string | null {
  return rangeControl().querySelector('[aria-pressed="true"]')?.textContent ?? null;
}

function chooseRange(name: string | RegExp): void {
  fireEvent.click(within(rangeControl()).getByRole('button', { name }));
}

function rowsChangedMark(): HTMLElement | null {
  return screen.queryByRole('img', { name: /rows shown changed/ });
}

afterEach(cleanup);

describe('the chart', () => {
  test('draws each bar where the model places it, through the style prop', () => {
    const { container } = renderProgress();
    const ownBar = container.querySelector('[data-task-id="1"] .board-progress-bar') as HTMLElement | null;

    expect(ownBar?.style.left).toBe('0%');
    expect(ownBar?.style.width).toBe('50%');
    expect(container.querySelectorAll('[data-task-id="1"] .board-progress-bar[data-bar-kind="review"]')).toHaveLength(2);
    expect(container.querySelector('.board-progress-now')).not.toBeNull();
  });

  test('opens a row’s detail in place over Progress on a click, Enter or Space, and never from a click on its number', () => {
    const { container, navigatedRoutes } = renderProgress();
    const row = container.querySelector('[data-task-id="1"]') as HTMLElement;
    fireEvent.click(row);
    fireEvent.keyDown(row, { key: 'Enter' });
    fireEvent.keyDown(row, { key: ' ' });
    fireEvent.click(screen.getByRole('link', { name: '#5' }));

    expect(navigatedRoutes).toEqual([
      { tab: 'gantt', item: 'task-row/1' },
      { tab: 'gantt', item: 'task-row/1' },
      { tab: 'gantt', item: 'task-row/1' },
    ]);
  });

  test('links a row’s number to its ticket on Tickets', () => {
    renderProgress();

    expect(screen.getByRole('link', { name: '#5' }).getAttribute('href')).toBe('#forge/example-tracker/tickets/ticket-row/5');
  });

  test('draws each row’s state as a badge of its word in the state column', () => {
    const { container } = renderProgress();
    const chip = container.querySelector('[data-task-id="1"] .board-progress-chip');

    expect(chip?.textContent).toBe('Done');
  });

  test('says when no row falls in the range, keeping the head', () => {
    renderProgress(exampleProgressBoard({ tasks: [] }));

    expect(screen.getByText('No tasks in this range.')).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Row options' })).not.toBeNull();
  });

  test('shows a planted name as text', () => {
    renderProgress();

    expect(screen.getByText(PLANTED_NAME)).not.toBeNull();
    expect((window as { plantedRan?: boolean }).plantedRan).toBeUndefined();
  });
});

describe('the review-rows choice', () => {
  test('draws the review rows above their ticket, latest round first, and stores the choice under its key', () => {
    const { container, storage } = renderProgress();
    expect(rowTaskIds(container)).toEqual(['4', '1']);

    openMenu('Row options');
    fireEvent.click(screen.getByRole('button', { name: /^Review passes as rows/ }));

    expect(rowTaskIds(container)).toEqual(['4', '2', '3', '1']);
    expect(container.querySelector('[data-task-id="2"]')?.getAttribute('data-review-of')).toBe('5');
    expect(storage.get(REVIEW_ROWS_KEY)).toBe('rows');
  });

  test('reads a stored choice', () => {
    const { container } = renderProgress(BOARD, [[REVIEW_ROWS_KEY, 'rows']]);

    expect(rowTaskIds(container)).toEqual(['4', '2', '3', '1']);
  });
});

test('opens with the title row: the view\'s name, Gantt, as a heading over its sentence', () => {
  renderProgress();

  expect(screen.getByRole('heading', { level: 2, name: 'Gantt' })).not.toBeNull();
  expect(screen.getByText(/^Each ticket's builds and reviews over time/)).not.toBeNull();
});

describe('the range control', () => {
  test('presses Fit by default and the preset chosen, with the range\'s ends and ticks beside it', () => {
    renderProgress();
    expect(pressedRange()).toBe('Fit');
    expect(within(rangeControl()).getAllByRole('button').map((segment) => segment.textContent)).toEqual(['Fit', '1h', '4h', '12h', '24h', '7d', 'Custom…']);

    chooseRange('4h');

    expect(pressedRange()).toBe('4h');
    expect(within(rangeControl()).getByRole('button', { name: /rows shown/ }).getAttribute('aria-pressed')).toBe('false');
    expect(document.querySelector('.board-progress-range-ends')?.textContent).toMatch(/ → .* ticks$/);
  });

  test('keeps the chosen range across a reload for the same viewer, under its key', () => {
    const { storage } = renderProgress();
    chooseRange('4h');
    expect(storage.get(BOARD_KEY)).toBe('{"presetKey":"4h","fromText":"-4h","toText":"now","tickMinutes":null}');
    cleanup();

    renderProgress(BOARD, storage);

    expect(pressedRange()).toBe('4h');
  });

  test('applies a custom range from its popover, handing the focus back to Custom…, and keeps it pressed across a reload', () => {
    const { storage } = renderProgress();
    chooseRange('Custom…');
    const popover = screen.getByRole('dialog', { name: 'Custom range' });
    fireEvent.change(screen.getByRole('textbox', { name: /From/ }), { target: { value: '-90m' } });
    fireEvent.click(screen.getByRole('button', { name: '15m' }));
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));

    expect(popover.isConnected).toBe(false);
    expect(document.activeElement).toBe(within(rangeControl()).getByRole('button', { name: 'Custom…' }));
    expect(JSON.parse(storage.get(BOARD_KEY) ?? 'null')).toEqual({
      presetKey: null, fromText: '-90m', toText: 'now', tickMinutes: 15
    });
    cleanup();

    renderProgress(BOARD, storage);
    expect(pressedRange()).toBe('Custom…');
  });
});

test('stores the wide-titles choice and marks the view with it', () => {
  const { storage, container } = renderProgress();
  openMenu('Row options');
  fireEvent.click(screen.getByRole('button', { name: /^Wide titles/ }));

  expect(container.querySelector('.board-progress-view')?.getAttribute('data-name-column')).toBe('wide');
  expect(storage.get(`${BOARD_KEY}:name-column`)).toBe('wide');
});

describe('the epic grouping', () => {
  const EPIC_BOARD = exampleProgressBoard({
    tasks: [
      exampleProgressTask(1, { ticket: '5', start: '2026-09-18T09:00:00+02:00' }),
      exampleProgressTask(2, { start: '2026-09-18T10:00:00+02:00' }),
    ],
    tickets: [exampleProgressTicket('5', { epics: ['checkout'] })],
    epics:   [exampleProgressEpic('checkout', { title: 'Checkout redesign', ticketIds: ['5'], ticketCountByStatus: ticketCountByStatusOf({ committed: 1 }) })],
  });

  test('draws the rows under their epic\'s head and No epic, and folds a group across a reload', () => {
    const { container, storage } = renderProgress(EPIC_BOARD);
    expect(rowTaskIds(container)).toEqual([null, '1', null, '2']);

    fireEvent.click(screen.getByRole('button', { name: /Checkout redesign/ }));

    expect(rowTaskIds(container)).toEqual([null, null, '2']);
    expect(screen.getByRole('button', { name: /Checkout redesign/ }).getAttribute('aria-expanded')).toBe('false');
    expect(storage.get(`${BOARD_KEY}:progress-folded-epics`)).toBe('["checkout"]');
    cleanup();

    expect(rowTaskIds(renderProgress(EPIC_BOARD, storage).container)).toEqual([null, null, '2']);
  });

  test('links an epic head\'s name to that epic on Epics, without folding the head', () => {
    const { container } = renderProgress(EPIC_BOARD);
    const epicLink = screen.getByRole('link', { name: 'Checkout redesign' });
    fireEvent.click(epicLink);

    expect(epicLink.getAttribute('href')).toBe('#forge/example-tracker/epics/epic/checkout');
    expect(rowTaskIds(container)).toEqual([null, '1', null, '2']);
  });

  test('folds and unfolds a head from the keyboard', () => {
    const { container } = renderProgress(EPIC_BOARD);
    fireEvent.keyDown(screen.getByRole('button', { name: /No epic/ }), { key: 'Enter' });
    expect(rowTaskIds(container)).toEqual([null, '1', null]);

    fireEvent.keyDown(screen.getByRole('button', { name: /No epic/ }), { key: ' ' });
    expect(rowTaskIds(container)).toEqual([null, '1', null, '2']);
  });
});

describe('the finished-work window', () => {
  const WINDOW_BOARD = exampleProgressBoard({
    tasks: [
      exampleProgressTask(1, {
        name: 'Example old work', status: 'delivered', start: '2026-09-16T09:00:00+02:00', end: '2026-09-16T10:00:00+02:00'
      }),
      exampleProgressTask(2, { name: 'Example open work', status: 'in-progress', start: '2026-09-18T11:00:00+02:00' }),
    ],
  });

  function renderInWindow(boardState: BoardDocument, cutoffEpochMilliseconds: number) {
    const finishedWorkWindow = {
      choice: '1d', cutoffEpochMilliseconds, nowEpochMilliseconds: Date.parse('2026-09-18T13:00:00+02:00'), showAll: () => undefined
    } as const;
    const view = <ProgressView board={boardState} boardStore={memoryBoardStore()} nowEpochMilliseconds={finishedWorkWindow.nowEpochMilliseconds} todayCalendarDate="2026-09-18" />;
    return render(routedOnTab('gantt', <FinishedWorkWindowContext.Provider value={finishedWorkWindow}>{view}</FinishedWorkWindowContext.Provider>).element);
  }

  test('draws no row that finished before the window, and every open row', () => {
    const { container } = renderInWindow(WINDOW_BOARD, Date.parse('2026-09-17T13:00:00+02:00'));

    expect(rowTaskIds(container)).toEqual(['2']);
  });

  test('marks a held range when the rows drawn change under it, never Fit', () => {
    const heldStore = [[BOARD_KEY, '{"presetKey":"4h","fromText":"-4h","toText":"now","tickMinutes":null}']] as const;
    const { storage } = renderProgress(WINDOW_BOARD, heldStore);
    expect(rowsChangedMark()).toBeNull();
    cleanup();

    const boardStore = boardPreferenceStoreOf('example-tracker', () => ({
      getItem:    (key) => storage.get(key) ?? null,
      setItem:    (key, value) => storage.set(key, value),
      removeItem: (key) => storage.delete(key),
    }));
    const viewOf = (cutoffEpochMilliseconds: number) => {
      const finishedWorkWindow = {
        choice: '1d', cutoffEpochMilliseconds, nowEpochMilliseconds: Date.parse('2026-09-18T13:00:00+02:00'), showAll: () => undefined
      } as const;
      return routedOnTab('gantt', (
        <FinishedWorkWindowContext.Provider value={finishedWorkWindow}>
          <ProgressView board={WINDOW_BOARD} boardStore={boardStore} nowEpochMilliseconds={finishedWorkWindow.nowEpochMilliseconds} todayCalendarDate="2026-09-18" />
        </FinishedWorkWindowContext.Provider>
      )).element;
    };
    const { rerender } = render(viewOf(Number.NEGATIVE_INFINITY));
    rerender(viewOf(Date.parse('2026-09-17T13:00:00+02:00')));

    expect(rowsChangedMark()).not.toBeNull();
    expect(document.querySelector('.board-progress-range-ends')?.hasAttribute('data-held')).toBe(true);

    rerender(viewOf(Number.NEGATIVE_INFINITY));
    expect(rowsChangedMark()).not.toBeNull();

    chooseRange('12h');
    expect(rowsChangedMark()).toBeNull();
  });
});

test('moves a tick label near the right edge to the left of its line', () => {
  const { container } = renderProgress();
  const ticks = [...container.querySelectorAll('.board-progress-tick-label')];

  expect(ticks.at(0)?.hasAttribute('data-label-side')).toBe(false);
  expect(ticks.at(-1)?.getAttribute('data-label-side')).toBe('left');
});

test('marks nothing on the first board, then each moved or new row until its highlight has played', () => {
  const view = (boardState: BoardDocument) => routedOnTab(
    'gantt',
    <ProgressView board={boardState} boardStore={memoryBoardStore()} nowEpochMilliseconds={Date.parse('2026-09-18T13:00:00+02:00')} todayCalendarDate="2026-09-18" />,
  ).element;
  const firstBoard = exampleProgressBoard({ tasks: [exampleProgressTask(1, { status: 'committed' }), exampleProgressTask(2, { status: 'committed' })] });
  const { rerender } = render(view(firstBoard));
  expect(document.querySelectorAll('.board-progress-row[data-changed]')).toHaveLength(0);

  rerender(view(exampleProgressBoard({
    tasks: [
      exampleProgressTask(1, { status: 'in-progress', start: '2026-09-18T12:00:00+02:00' }),
      exampleProgressTask(2, { status: 'committed' }),
      exampleProgressTask(3, { status: 'committed' }),
    ],
  })));
  expect(rowTaskIds(document.body).filter((taskId) => document.querySelector(`[data-task-id="${String(taskId)}"]`)?.hasAttribute('data-changed'))).toEqual(['3', '1']);

  const movedRow = document.querySelector('[data-task-id="1"]') as HTMLElement;
  fireEvent.animationEnd(movedRow.querySelector('.board-progress-name') as HTMLElement);
  expect(movedRow.hasAttribute('data-changed')).toBe(true);
  fireEvent.animationEnd(movedRow);
  expect(movedRow.hasAttribute('data-changed')).toBe(false);
});

describe('the board range and clear controls', () => {
  function renderWithControls() {
    const fake = fakeControlSurroundingsOf();
    const storage = new Map<string, string>();
    const boardStore = boardPreferenceStoreOf('example-tracker', () => ({
      getItem:    (key) => storage.get(key) ?? null,
      setItem:    (key, value) => storage.set(key, value),
      removeItem: (key) => storage.delete(key),
    }));
    const routed = routedOnTab(
      'gantt',
      <ProgressView board={BOARD} boardStore={boardStore} nowEpochMilliseconds={Date.parse('2026-09-18T13:00:00+02:00')} todayCalendarDate="2026-09-18" />,
    );
    render(<ControlSurroundingsContext.Provider value={fake.surroundings}>{routed.element}</ControlSurroundingsContext.Provider>);
    return fake;
  }

  async function clicked(element: HTMLElement): Promise<void> {
    await act(async () => {
      fireEvent.click(element);
      await Promise.resolve();
    });
  }

  test('Save as the board\'s range posts Fit as the automatic span, and a preset as its bounds', async () => {
    const fake = renderWithControls();
    await clicked(screen.getByRole('button', { name: 'Save as the board\'s range' }));
    chooseRange('4h');
    await clicked(screen.getByRole('button', { name: 'Save as the board\'s range' }));
    expect(fake.sent).toEqual([
      { boardCommandVersion: BOARD_COMMAND_VERSION, kind: 'chart-range-set', range: { kind: 'automatic' } },
      {
        boardCommandVersion: BOARD_COMMAND_VERSION,
        kind:                'chart-range-set',
        range:               {
          kind: 'window', from: '-4h', to: 'now', tickMinutes: null
        }
      },
    ]);
  });

  test('Clear… asks first: Cancel sends nothing, and each confirm posts its scope', async () => {
    const fake = renderWithControls();
    await clicked(screen.getByRole('button', { name: 'Clear…' }));
    await clicked(screen.getByRole('button', { name: 'Cancel' }));
    expect(fake.sent).toEqual([]);
    await clicked(screen.getByRole('button', { name: 'Clear…' }));
    await clicked(screen.getByRole('button', { name: 'Clear rows and log' }));
    await clicked(screen.getByRole('button', { name: 'Clear…' }));
    await clicked(screen.getByRole('button', { name: /^Clear everything/u }));
    expect(fake.sent).toEqual([
      { boardCommandVersion: BOARD_COMMAND_VERSION, kind: 'tracker-clear', scope: 'tasks-and-log' },
      { boardCommandVersion: BOARD_COMMAND_VERSION, kind: 'tracker-clear', scope: 'everything' },
    ]);
  });
});

test('the tab is a workplace of Flint', () => {
  const { container } = renderProgress();
  expect(container.querySelector('.board-progress-view')?.hasAttribute('data-flint-workplace')).toBe(true);
});
