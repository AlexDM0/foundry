/**
 * The Kanban against a fake command client and a fake clock, in a happy-dom document. What matters: the six lanes with their counts and
 * no draft, a draft ticket, a ticket for review and a filing draft living in Tickets only, while the head links to Tickets saying how many
 * drafts wait on User (`docs/design/board-menu.md`); the card anatomy (id, size mark, priority, type, tokens, epics, waiting-on, hold, no
 * row, the footer stamp) as text, a planted payload included; a card opens the ticket form in place, and a control inside a card or a click
 * ending a text selection opens nothing; a waiting-on id brings the card it names into focus; a working card's stamp ticks while the
 * stream is live and holds still while it is down; a card offers no move of its own (no move button, no checkbox, no Ready selected: the
 * ticket panel holds the moves), and hovering or focusing it adds no element; the filter menu's pressed epics narrow the lanes; a card
 * whose state moved on the next board is marked changed for a moment; a header figure's lane is outlined for a moment; a card's asks pill
 * opens the question panel at its decision; and while a detail or the question panel is open the board carries its panel room. Also: the
 * lanes' priority and state groups, "needed first" and `↦ N`, the hover marks and arrows (against stubbed card boxes, since happy-dom
 * lays nothing out), the Ready lane by wave, a closed lane's pages and the finished-work window's hidden line, and the Abandoned lane's
 * fold, each choice stored under its key; the title row, the dashed card of a state that waits for a person, and no state badge.
 * The view is a workplace of Flint.
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

import type { BoardCommandDocument }          from '../../../@types/board/BoardCommandDocument.ts';
import type { BoardDocument }                 from '../../../@types/board/BoardDocument.ts';
import type { CommandOutcome }                from '../../api/BoardCommandClient.ts';
import { boardPreferenceStoreOf }             from '../../preferences/PreferenceStore.ts';
import { BoardClockContext, type BoardClock } from '../../shell/BoardClock.ts';
import type { BoardRoute }                    from '../../shell/BoardRouter.ts';
import { ControlSurroundingsContext }         from '../../shell/ControlAvailability.ts';
import type { ControlAvailability }           from '../../shell/ControlAvailability.ts';
import { QuestionPanelShownContext }          from '../../shell/CoveringPanel.ts';
import type { DetailItem }                    from '../../shell/DetailRoute.ts';
import { FinishedWorkWindowContext }          from '../../shell/FinishedWorkWindow.ts';
import type { FinishedWorkWindow }            from '../../shell/FinishedWorkWindow.ts';
import { QuestionPanelOpenerContext }         from '../../shell/QuestionPanelOpener.ts';
import { routedOnTab }                        from '../../testing/DetailRoutingFixture.ts';
import { fakeControlSurroundingsOf }          from '../../testing/FakeControlSurroundings.ts';
import { EXAMPLE_NOW_EPOCH_MILLISECONDS }     from '../../testing/KanbanBoardFixture.ts';
import { exampleBoard, exampleTicket }        from '../../testing/KanbanBoardFixture.ts';
import { KanbanModel, type KanbanReadyOrder } from './KanbanModel.ts';
import {
  CHANGE_HIGHLIGHT_MILLISECONDS,
  KanbanView,
  LANE_HIGHLIGHT_MILLISECONDS,
  type KanbanLaneHighlightRequest
} from './KanbanView.tsx';

const PLANTED_TITLE = '<img src=x onerror="window.plantedRan = true">';

const BOARD = exampleBoard({
  tickets: [
    exampleTicket('001', { status: 'draft' }),
    exampleTicket('002', { status: 'draft' }),
    exampleTicket('003', {
      size: 'L', priority: 'high', type: 'bug', epics: ['checkout']
    }),
    exampleTicket('004', { hold: 'waiting on the example vendor', title: PLANTED_TITLE }),
    exampleTicket('005', { status: 'in-progress', epics: ['billing'] }),
  ],
  waitingOn:  { '004': ['003'] },
  tokensById: { '005': 2_500 },
});

const MERGE_QUEUE_HREF = '#forge/example-tracker/progress/kanban/merge-queue';

const SHOWING_ALL_FINISHED: FinishedWorkWindow = { choice: 'all', cutoffEpochMilliseconds: Number.NEGATIVE_INFINITY, nowEpochMilliseconds: EXAMPLE_NOW_EPOCH_MILLISECONDS };

const MILLISECONDS_PER_SECOND = 1000;

interface KanbanSurroundingsChoice {
  readonly availability?:         ControlAvailability;
  readonly storedEntries?:        readonly [string, string][];
  readonly initialBoard?:         BoardDocument;
  readonly streamIsLive?:         boolean;
  readonly finishedWork?:         FinishedWorkWindow;
  readonly openItem?:             DetailItem | null;
  readonly pressedChips?:         readonly string[];
  readonly readyOrder?:           KanbanReadyOrder;
  readonly laneHighlight?:        KanbanLaneHighlightRequest | null;
  readonly questionPanelIsShown?: boolean;
  readonly draftsWaitingCount?:   number;
}

interface RenderedKanban {
  readonly sent:                    BoardCommandDocument[];
  readonly storage:                 Map<string, string>;
  /** Every route an opener asked for, across rerenders. */
  readonly navigatedRoutes:         () => BoardRoute[];
  readonly showAllFinishedAsk:      { count: number };
  readonly answerWith:              (outcome: CommandOutcome) => void;
  readonly rerender:                (boardState: BoardDocument, openItem?: DetailItem | null) => void;
  /** Moves the fake clock on by whole seconds, ticking every second and calling what fell due. */
  readonly advanceSeconds:          (seconds: number) => void;
  readonly laneHighlightTakenCount: () => number;
  /** Every decision an asks pill opened the question panel at, in order. */
  readonly openedDecisionIds:       string[];
}

function renderKanbanWith({
  availability = 'enabled', storedEntries = [], initialBoard = BOARD, streamIsLive = true, finishedWork = SHOWING_ALL_FINISHED, openItem = null,
  pressedChips = [], readyOrder = 'filed', laneHighlight = null, questionPanelIsShown = false, draftsWaitingCount = 0
}: KanbanSurroundingsChoice): RenderedKanban {
  const openedDecisionIds: string[] = [];
  const { surroundings, sent, answerWith } = fakeControlSurroundingsOf(availability);
  const storage = new Map<string, string>(storedEntries);
  const showAllFinishedAsk = { count: 0 };
  let currentEpochMilliseconds = EXAMPLE_NOW_EPOCH_MILLISECONDS;
  const ticks = new Set<() => void>();
  const pendingCalls = new Set<{ readonly dueAt: number; readonly callback: () => void }>();
  let laneHighlightTakenCount = 0;
  const clock: BoardClock = {
    now:         () => new Date(currentEpochMilliseconds),
    everySecond: (tick) => {
      ticks.add(tick);
      return () => ticks.delete(tick);
    },
    after: (milliseconds, callback) => {
      const call = { dueAt: currentEpochMilliseconds + milliseconds, callback };
      pendingCalls.add(call);
      return () => pendingCalls.delete(call);
    },
  };
  const boardStore = boardPreferenceStoreOf('example-tracker', () => ({
    getItem:    (key) => storage.get(key) ?? null,
    setItem:    (key, value) => storage.set(key, value),
    removeItem: (key) => storage.delete(key),
  }));
  const routeLists: BoardRoute[][] = [];
  const tree = (boardState: BoardDocument, shownItem: DetailItem | null = openItem) => {
    const routed = routedOnTab('kanban', (
      <KanbanView
        board={boardState}
        filters={KanbanModel.kanbanFilterModelOf(boardState, pressedChips, readyOrder)}
        boardStore={boardStore}
        streamIsLive={streamIsLive}
        mergeQueueHref={MERGE_QUEUE_HREF}
        draftsWaitingCount={draftsWaitingCount}
        ticketsHref="#forge/example-tracker/tickets"
        onShowAllFinished={() => {
          showAllFinishedAsk.count += 1;
        }}
        laneHighlight={laneHighlight}
        onLaneHighlightTaken={() => {
          laneHighlightTakenCount += 1;
        }}
      />
    ), shownItem);
    routeLists.push(routed.navigatedRoutes);
    return (
      <ControlSurroundingsContext value={surroundings}>
        <BoardClockContext value={clock}>
          <FinishedWorkWindowContext value={finishedWork}>
            <QuestionPanelOpenerContext value={(decisionId) => openedDecisionIds.push(decisionId)}>
              <QuestionPanelShownContext value={questionPanelIsShown}>
                {routed.element}
              </QuestionPanelShownContext>
            </QuestionPanelOpenerContext>
          </FinishedWorkWindowContext>
        </BoardClockContext>
      </ControlSurroundingsContext>
    );
  };
  const rendered = render(tree(initialBoard));
  return {
    sent,
    storage,
    navigatedRoutes: () => routeLists.flat(),
    showAllFinishedAsk,
    answerWith,
    rerender:        (boardState, shownItem) => rendered.rerender(tree(boardState, shownItem)),
    advanceSeconds:  (seconds) => {
      for (let i = 0; i < seconds; i += 1) {
        currentEpochMilliseconds += MILLISECONDS_PER_SECOND;
        const dueCalls = [...pendingCalls].filter((call) => call.dueAt <= currentEpochMilliseconds);
        dueCalls.forEach((call) => pendingCalls.delete(call));
        act(() => {
          ticks.forEach((tick) => tick());
          dueCalls.forEach((call) => call.callback());
        });
      }
    },
    laneHighlightTakenCount: () => laneHighlightTakenCount,
    openedDecisionIds,
  };
}

function renderKanban(availability: ControlAvailability = 'enabled', storedEntries: readonly [string, string][] = [], initialBoard: BoardDocument = BOARD): RenderedKanban {
  return renderKanbanWith({ availability, storedEntries, initialBoard });
}

function laneNamed(title: string): HTMLElement {
  return screen.getByRole('region', { name: title });
}

function cardNamed(namePrefix: string): HTMLElement {
  return screen.getAllByRole('article').find((card) => card.getAttribute('aria-label')?.startsWith(namePrefix) === true)
    ?? (() => {
      throw new Error(`no card named ${namePrefix}`);
    })();
}

async function clicked(element: HTMLElement): Promise<void> {
  await act(async () => {
    fireEvent.click(element);
    await Promise.resolve();
  });
}

afterEach(() => {
  cleanup();
});

describe('the lanes and the cards', () => {
  test('the view opens with its title row: Kanban as the view\'s heading, and the board\'s sentence under it', () => {
    renderKanban();
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe('Kanban');
    expect(screen.getByText('Every ticket by where it stands. Click a card to open it. Hover a card to see what it waits on.').tagName).toBe('P');
    expect(screen.getAllByRole('heading', { level: 3 }).map((heading) => heading.textContent)).toEqual(['Ready', 'Building', 'In review', 'Merge queue', 'Done']);
  });

  test('a card is the design system\'s card, dashed while its state waits for a person, with no state badge', () => {
    renderKanban('enabled', [], exampleBoard({ tickets: [exampleTicket('003'), exampleTicket('006', { status: 'in-review' })] }));
    const cardBoxOf = (namePrefix: string) => cardNamed(namePrefix).querySelector(':scope > .design-system-card');
    expect([cardBoxOf('#006'), cardBoxOf('#003')].map((box) => box?.hasAttribute('data-dashed'))).toEqual([true, false]);
    expect(cardBoxOf('#003')?.hasAttribute('data-interactive')).toBe(true);
    expect(document.querySelector('.board-kanban-card .design-system-state-pill, .board-kanban-card .design-system-state-badge')).toBeNull();
  });

  test('the six lanes show in order, each with its count, Ready holding no draft', () => {
    renderKanban();
    const lanes = screen.getAllByRole('region').filter((region) => region.hasAttribute('data-lane'));
    expect(lanes.map((lane) => [lane.getAttribute('aria-label'), lane.querySelector('.board-lane-count')?.textContent])).toEqual([
      ['Ready', '2'],
      ['Building', '1'],
      ['In review', '0'],
      ['Merge queue', '0'],
      ['Done', '0'],
      ['Abandoned', '0'],
    ]);
    expect([...laneNamed('Ready').querySelectorAll('.board-lane-group')].map((head) => head.textContent)).toEqual(['High 1', 'Normal 1']);
    expect(within(laneNamed('In review')).getByText('Nothing in review.')).toBeTruthy();
  });

  test('a card shows its id, size mark, priority, type, epics, waiting-on and hold, and its tokens', () => {
    renderKanban();
    const card = cardNamed('#003');
    expect(card.querySelector('.design-system-mono-id')?.textContent).toBe('#003');
    const size = card.querySelector('.board-kanban-size');
    expect([size?.textContent, size?.getAttribute('data-size'), size?.getAttribute('title')]).toEqual(['L', 'L', 'Size L']);
    expect(card.querySelector('.board-priority-mark')?.textContent).toBe('high');
    expect(card.querySelector('.board-type-mark')?.textContent).toBe('bug');
    expect(card.querySelector('.board-epic-chip')?.textContent).toBe('Example checkout');
    const held = cardNamed('#004');
    expect(held.querySelector('.board-waiting-on')?.textContent).toBe('waiting on #003');
    expect(held.querySelector('.board-kanban-held')?.getAttribute('title')).toBe('Held: waiting on the example vendor');
    expect(cardNamed('#005').querySelector('.board-kanban-tokens')?.textContent).toBe('2.5k tokens');
  });

  test('a normal-priority card shows no priority mark, and an unsized one no size mark', () => {
    renderKanban();
    expect(cardNamed('#005').querySelector('.board-priority-mark')).toBeNull();
    expect(cardNamed('#005').querySelector('.board-kanban-size')).toBeNull();
  });

  test('a draft ticket, a ticket for review and a filing draft are on no lane: Tickets holds them', () => {
    renderKanban('enabled', [], exampleBoard({ tickets: [exampleTicket('001', { status: 'draft' }), exampleTicket('011', { status: 'ready-for-review' }), exampleTicket('003')] }));
    expect(screen.getAllByRole('article').map((card) => card.getAttribute('aria-label')?.split(' ')[0])).toEqual(['#003']);
  });

  test('the head links to Tickets saying how many drafts wait on User, and says nothing while none does', () => {
    renderKanbanWith({ draftsWaitingCount: 3 });
    expect(screen.getByRole('link', { name: '3 drafts wait on you' }).getAttribute('href')).toBe('#forge/example-tracker/tickets');
    cleanup();
    renderKanbanWith({ draftsWaitingCount: 1 });
    expect(screen.getByRole('link', { name: '1 draft waits on you' })).toBeDefined();
    cleanup();
    renderKanbanWith({});
    expect(screen.queryByRole('link', { name: /wait.* on you/u })).toBeNull();
  });

  test('a planted payload in a title reaches the DOM only as text', () => {
    renderKanban();
    const card = cardNamed('#004');
    expect(card.querySelector('.board-kanban-title')?.textContent).toBe(PLANTED_TITLE);
    expect(card.querySelector('img')).toBeNull();
    expect((window as unknown as { plantedRan?: boolean }).plantedRan).toBeUndefined();
  });
});

describe('the card\'s controls', () => {
  const REMOVED_ACTION_ROW_SELECTOR = '.board-kanban-actions, .board-kanban-select, .board-kanban-actions-label';
  const ACTIONABLE_SELECTOR = 'a, button, input, select, textarea, [tabindex]';
  const BOARD_OF_EVERY_READY_STATUS = exampleBoard({
    tickets: [
      exampleTicket('001', { status: 'draft' }),
      exampleTicket('003', { epics: ['checkout'] }),
      exampleTicket('004', { hold: 'waiting on the example vendor' }),
      exampleTicket('005', { status: 'in-progress' }),
      exampleTicket('011', { status: 'ready-for-review' }),
    ],
    waitingOn: { '004': ['003'] },
    decisions: [{ id: 'E7', kind: 'agent-question', ticketIds: ['003'] }],
  });

  test('no card renders a move button, a checkbox or an action-row element, and no lane head offers Ready selected', () => {
    renderKanban('enabled', [], BOARD_OF_EVERY_READY_STATUS);
    const cards = screen.getAllByRole('article');
    expect(cards.length).toBeGreaterThan(0);
    expect(cards.flatMap((card) => [...card.querySelectorAll('button')]).map((button) => button.textContent)).toEqual(['asks E7']);
    expect(cards.flatMap((card) => [...card.querySelectorAll(`input, ${REMOVED_ACTION_ROW_SELECTOR}`)])).toEqual([]);
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(screen.queryByText('Ready selected')).toBeNull();
  });

  test('a card\'s only controls are its links (its epic chips and its waiting-on ids) and its asks pill', () => {
    renderKanban('enabled', [], BOARD_OF_EVERY_READY_STATUS);
    const controls = screen.getAllByRole('article').flatMap((card) => [...card.querySelectorAll(ACTIONABLE_SELECTOR)]);
    expect(controls.map((control) => control.className)).toContain('board-waiting-on-link');
    expect(controls.filter((control) => control.tagName !== 'A').map((control) => control.textContent)).toEqual(['asks E7']);
  });

  test('hovering or focusing a card adds or shows no element in it', async () => {
    renderKanban();
    const card = cardNamed('#004');
    const childElementsOf = (): string[] => [...card.querySelectorAll('*')].map((element) => `${element.tagName} ${element.className} ${element.getAttribute('hidden') ?? ''}`);
    const atRest = childElementsOf();
    expect(atRest.length).toBeGreaterThan(0);
    fireEvent.pointerEnter(card);
    fireEvent.mouseOver(card);
    expect(childElementsOf()).toEqual(atRest);
    await act(async () => {
      card.focus();
      fireEvent.focus(card);
      await Promise.resolve();
    });
    expect(document.activeElement).toBe(card);
    expect(childElementsOf()).toEqual(atRest);
  });
});

describe('the epic filter', () => {
  test('the pressed epics narrow the lanes to their tickets, and no chip row sits over the lanes', () => {
    renderKanbanWith({ pressedChips: ['billing'] });
    expect(laneNamed('Ready').querySelectorAll('.board-kanban-card').length).toBe(0);
    expect(laneNamed('Building').querySelectorAll('.board-kanban-card').length).toBe(1);
    expect(document.querySelector('.board-kanban .board-chips')).toBeNull();
  });
});

describe('the change highlight', () => {
  test('a card whose state moved on the next board is marked changed for a moment, and the others are not', () => {
    const kanban = renderKanban();
    expect(document.querySelectorAll('[data-changed]').length).toBe(0);
    const next = exampleBoard({
      tickets: [
        exampleTicket('001', { status: 'draft' }),
        exampleTicket('002', { status: 'draft' }),
        exampleTicket('003', {
          status: 'in-progress', size: 'L', priority: 'high', type: 'bug', epics: ['checkout']
        }),
        exampleTicket('004', { hold: 'waiting on the example vendor', title: PLANTED_TITLE }),
        exampleTicket('005', { status: 'in-progress', epics: ['billing'] }),
      ],
    });
    act(() => kanban.rerender(next));
    expect([...document.querySelectorAll('[data-changed]')].map((card) => card.getAttribute('data-card'))).toEqual(['ticket:003']);
    kanban.advanceSeconds(Math.floor(CHANGE_HIGHLIGHT_MILLISECONDS / MILLISECONDS_PER_SECOND));
    expect(document.querySelectorAll('[data-changed]').length).toBe(1);
    kanban.advanceSeconds(1);
    expect(document.querySelectorAll('[data-changed]').length).toBe(0);
  });
});

describe('the lane highlight', () => {
  test('a header figure\'s lane is outlined until its moment is over, and the request is taken once', () => {
    const kanban = renderKanbanWith({ laneHighlight: { laneKey: 'building', sequence: 1 } });
    expect([...document.querySelectorAll('.board-lane[data-highlighted]')].map((lane) => lane.getAttribute('data-lane'))).toEqual(['building']);
    expect(kanban.laneHighlightTakenCount()).toBe(1);
    kanban.advanceSeconds(Math.ceil(LANE_HIGHLIGHT_MILLISECONDS / MILLISECONDS_PER_SECOND));
    expect(document.querySelectorAll('.board-lane[data-highlighted]').length).toBe(0);
  });
});

describe('the panel room', () => {
  test('while a detail is open the board carries its room and the frame its cover, and both go once it closes', () => {
    const kanban = renderKanbanWith({ openItem: { form: 'ticket', ticketId: '003' } });
    const lanes = document.querySelector('.board-kanban-lanes');
    expect(lanes?.hasAttribute('data-panel-room')).toBe(true);
    expect((lanes as HTMLElement | null)?.style.getPropertyValue('--panel-room')).toBe('0px');
    expect((document.querySelector('.board-kanban-frame') as HTMLElement | null)?.style.getPropertyValue('--panel-cover')).toBe('0px');
    act(() => kanban.rerender(BOARD, null));
    expect(lanes?.hasAttribute('data-panel-room')).toBe(false);
  });

  test('while the question panel shows the board carries its room too', () => {
    renderKanbanWith({ questionPanelIsShown: true });
    expect(document.querySelector('.board-kanban-lanes')?.hasAttribute('data-panel-room')).toBe(true);
  });
});

describe('the asks pill', () => {
  test('a card an open decision names carries asks E7, which opens the question panel at it and opens no detail', () => {
    const board = exampleBoard({
      tickets:   [exampleTicket('003'), exampleTicket('004')],
      decisions: [{ id: 'E7', kind: 'agent-question', ticketIds: ['004'] }],
    });
    const kanban = renderKanbanWith({ initialBoard: board });
    expect(within(cardNamed('#003')).queryByRole('button', { name: /^asks/u })).toBeNull();
    const pill = within(cardNamed('#004')).getByRole('button', { name: 'asks E7' });
    act(() => pill.click());
    expect(kanban.openedDecisionIds).toEqual(['E7']);
    expect(kanban.navigatedRoutes()).toEqual([]);
  });
});

const DEPENDENCY_BOARD = exampleBoard({
  tickets: [
    exampleTicket('110'),
    exampleTicket('111', { status: 'in-progress' }),
    exampleTicket('112', { dependsOn: ['110', '111'] }),
    exampleTicket('113', { dependsOn: ['112'] }),
  ],
  readyTicketIds: ['110'],
});

describe('the dependency marks and arrows', () => {
  const CARD_LEFT_BY_LANE: Readonly<Record<string, number>> = { ready: 0, building: 300 };
  const originalBoundingBox = Element.prototype.getBoundingClientRect;

  /** happy-dom lays nothing out, so each card gets a box: its lane's column, stacked by its place in the lane. */
  function layOutCards(): void {
    Element.prototype.getBoundingClientRect = function boxOf(this: Element) {
      const lane = this.closest('[data-lane]');
      if (!this.hasAttribute('data-card') || lane === null) return DOMRect.fromRect({
        x: 0, y: 0, width: 0, height: 0
      });
      const place = [...lane.querySelectorAll('[data-card]')].indexOf(this);
      return DOMRect.fromRect({
        x: CARD_LEFT_BY_LANE[lane.getAttribute('data-lane') ?? ''] ?? 0, y: place * 100, width: 200, height: 30
      });
    };
  }

  afterEach(() => {
    Element.prototype.getBoundingClientRect = originalBoundingBox;
  });

  test('a ticket another depends on carries "needed first", shown only while a dependent is hovered, and ↦ N counts what waits on it', () => {
    renderKanban('enabled', [], DEPENDENCY_BOARD);
    expect(cardNamed('#110').querySelector('.board-kanban-needed-first')?.textContent).toBe('needed first');
    expect(cardNamed('#113').querySelector('.board-kanban-needed-first')).toBeNull();
    const heldCount = cardNamed('#110').querySelector('.board-kanban-held-count');
    expect([heldCount?.textContent, heldCount?.getAttribute('title')]).toEqual(['↦ 2', '2 tickets wait on this one, directly or further down the chain']);
    expect(cardNamed('#113').querySelector('.board-kanban-held-count')).toBeNull();
    expect(document.querySelectorAll('[data-needed-first]').length).toBe(0);
  });

  test('hovering a card marks the cards it depends on needed first and draws an arrow from each, and leaving the board removes both', () => {
    layOutCards();
    renderKanban('enabled', [], DEPENDENCY_BOARD);
    act(() => {
      fireEvent.mouseOver(cardNamed('#112').querySelector('.board-kanban-title') ?? cardNamed('#112'));
    });
    expect([...document.querySelectorAll('[data-needed-first]')].map((card) => card.getAttribute('data-card'))).toEqual(['ticket:110', 'ticket:111']);
    const arrows = [...document.querySelectorAll('.board-kanban-arrows g')];
    expect(arrows.map((arrow) => arrow.getAttribute('data-route'))).toEqual(['same-lane', 'leftward']);
    expect(arrows.every((arrow) => arrow.querySelector('.board-kanban-arrow-line')?.getAttribute('d')?.startsWith('M ') === true)).toBe(true);
    act(() => {
      fireEvent.mouseLeave(document.querySelector('.board-kanban-frame') ?? document.body);
    });
    expect(document.querySelector('.board-kanban-arrows')).toBeNull();
    expect(document.querySelectorAll('[data-needed-first]').length).toBe(0);
  });
});

describe('the Ready lane by wave', () => {
  test('a board without dependencies stays filed, whatever order was asked', () => {
    renderKanbanWith({ readyOrder: 'by-wave' });
    expect(laneNamed('Ready').querySelector('.board-lane-wave')).toBeNull();
    expect(screen.queryByRole('group', { name: 'Order Ready' })).toBeNull();
  });

  test('by wave divides the Ready lane into its waves, the one-ticket ones narrow', () => {
    renderKanbanWith({ initialBoard: DEPENDENCY_BOARD, readyOrder: 'by-wave' });
    const waves = [...laneNamed('Ready').querySelectorAll('.board-lane-wave')];
    expect(waves.map((wave) => [
      wave.querySelector('.board-lane-group')?.textContent,
      wave.hasAttribute('data-narrow'),
      [...wave.querySelectorAll('.design-system-mono-id')].map((id) => id.textContent),
    ])).toEqual([
      ['Now 1 ready · 2 side by side', false, ['#110']],
      ['Wave 2 one at a time', true, ['#112']],
      ['Wave 3 one at a time', true, ['#113']],
    ]);
  });
});

describe('the closed lanes\' pages', () => {
  const STORAGE_KEY = 'gaia:board:example-tracker:kanban-done-shown';
  const deliveredStampOf = (minute: number) => `2026-10-01T10:${String(minute).padStart(2, '0')}:00+02:00`;
  const deliveredTickets = Array.from({ length: 20 }, (_ticket, i) => exampleTicket(String(400 + i), { status: 'delivered', delivered: deliveredStampOf(i) }));
  const DONE_BOARD = exampleBoard({ tickets: deliveredTickets });

  test('a closed lane shows its first page and counts every card; Show more adds the rest and Latest goes back to the first page', async () => {
    const kanban = renderKanban('enabled', [], DONE_BOARD);
    const done = laneNamed('Done');
    expect(done.querySelector('.board-lane-count')?.textContent).toBe('20');
    expect(done.querySelectorAll('.board-kanban-card').length).toBe(15);
    expect(done.querySelector('.board-lane-more span')?.textContent).toBe('15 of 20 shown');
    await clicked(within(done).getByRole('button', { name: 'Show 5 more' }));
    expect(done.querySelectorAll('.board-kanban-card').length).toBe(20);
    expect(kanban.storage.get(STORAGE_KEY)).toBe('20');
    await clicked(within(done).getByRole('button', { name: 'Latest 15' }));
    expect(done.querySelectorAll('.board-kanban-card').length).toBe(15);
    expect(kanban.storage.has(STORAGE_KEY)).toBe(false);
  });
});

describe('the Abandoned lane\'s fold', () => {
  const STORAGE_KEY = 'gaia:board:example-tracker:kanban-abandoned';
  const ABANDONED_BOARD = exampleBoard({ tickets: [exampleTicket('500', { status: 'abandoned', abandonedAt: '2026-10-02T10:00:00+02:00' })] });

  test('the Abandoned lane is folded to its head and count until opened, and the choice is stored under its key', async () => {
    const kanban = renderKanban('enabled', [], ABANDONED_BOARD);
    const abandoned = laneNamed('Abandoned');
    expect(abandoned.hasAttribute('data-collapsed')).toBe(true);
    expect(abandoned.querySelector('.board-lane-count')?.textContent).toBe('1');
    expect(abandoned.querySelector('.board-kanban-card')).toBeNull();
    const toggle = within(abandoned).getByRole('button', { name: 'Show the abandoned tickets' });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    await clicked(toggle);
    expect(abandoned.hasAttribute('data-collapsed')).toBe(false);
    expect(abandoned.querySelectorAll('.board-kanban-card').length).toBe(1);
    expect(within(abandoned).getByRole('button', { name: 'Collapse the abandoned tickets' }).getAttribute('aria-expanded')).toBe('true');
    expect(kanban.storage.get(STORAGE_KEY)).toBe('open');
  });

  test('a stored open choice is read back on render', () => {
    renderKanban('enabled', [[STORAGE_KEY, 'open']], ABANDONED_BOARD);
    expect(laneNamed('Abandoned').querySelectorAll('.board-kanban-card').length).toBe(1);
  });
});

describe('opening a card', () => {
  test('a ticket card opens the ticket form over the Kanban, by click, Enter or Space; a second click on the open card closes it', () => {
    const kanban = renderKanban();
    fireEvent.click(cardNamed('#003').querySelector('.board-kanban-title') ?? cardNamed('#003'));
    fireEvent.keyDown(cardNamed('#005'), { key: 'Enter' });
    fireEvent.keyDown(cardNamed('#004'), { key: ' ' });
    expect(kanban.navigatedRoutes()).toEqual([
      { tab: 'kanban', item: 'ticket/003' },
      { tab: 'kanban', item: 'ticket/005' },
      { tab: 'kanban', item: 'ticket/004' },
    ]);
  });

  test('the open card is marked selected, and a click on it closes it', () => {
    const kanban = renderKanbanWith({ openItem: { form: 'ticket', ticketId: '003' } });
    expect(document.querySelectorAll('.board-kanban-card[data-selected]').length).toBe(1);
    expect(cardNamed('#003').hasAttribute('data-selected')).toBe(true);
    expect(cardNamed('#003').querySelector('.design-system-card')?.hasAttribute('data-selected')).toBe(true);
    fireEvent.click(cardNamed('#003'));
    expect(kanban.navigatedRoutes()).toEqual([{ tab: 'kanban', item: null }]);
  });

  test('an epic chip, or Enter on a card\'s own control, opens nothing', () => {
    const kanban = renderKanban();
    fireEvent.click(cardNamed('#003').querySelector('.board-epic-chip') ?? document.body);
    fireEvent.keyDown(within(cardNamed('#004')).getByRole('link', { name: '#003' }), { key: 'Enter' });
    expect(kanban.navigatedRoutes()).toEqual([]);
  });

  test('a click that ends a text selection opens nothing', () => {
    const kanban = renderKanban();
    const title = cardNamed('#003').querySelector('.board-kanban-title') ?? document.body;
    const selection = window.getSelection();
    selection?.selectAllChildren(title);
    fireEvent.click(title);
    selection?.removeAllRanges();
    expect(kanban.navigatedRoutes()).toEqual([]);
  });

  test('a waiting-on id brings the card it names into focus instead of following its link', () => {
    const kanban = renderKanban();
    const link = within(cardNamed('#004')).getByRole('link', { name: '#003' });
    expect(link.getAttribute('href')).toBe('#forge/example-tracker/progress/kanban/ticket/003');
    const followed = fireEvent.click(link);
    expect(followed).toBe(false);
    expect(document.activeElement).toBe(cardNamed('#003'));
    expect(kanban.navigatedRoutes()).toEqual([]);
  });
});

describe('the footer stamp and the live pulse', () => {
  const BUILD_START = new Date(EXAMPLE_NOW_EPOCH_MILLISECONDS - ((2 * 60 * 60) + (36 * 60)) * MILLISECONDS_PER_SECOND).toISOString();
  const LIVE_BOARD = exampleBoard({
    tickets:     [exampleTicket('600', { status: 'in-progress', started: BUILD_START }), exampleTicket('601')],
    ownRowsById: { 600: { start: BUILD_START } },
  });

  test('a building card ticks "building" and its time at work every second while the stream is live, and is marked live', () => {
    const kanban = renderKanbanWith({ initialBoard: LIVE_BOARD });
    const card = cardNamed('#600');
    expect(card.querySelector('.board-kanban-stamp')?.textContent).toBe('building 2h 36m 00s');
    kanban.advanceSeconds(2);
    expect(card.querySelector('.board-kanban-stamp')?.textContent).toBe('building 2h 36m 02s');
    expect([card.hasAttribute('data-live'), cardNamed('#601').hasAttribute('data-live')]).toEqual([true, false]);
    expect(cardNamed('#601').querySelector('.board-kanban-stamp')?.textContent).toBe('filed 10-01 09:00');
  });

  test('while the stream is down the stamp holds still', () => {
    const kanban = renderKanbanWith({ initialBoard: LIVE_BOARD, streamIsLive: false });
    kanban.advanceSeconds(2);
    expect(cardNamed('#600').querySelector('.board-kanban-stamp')?.textContent).toBe('building 2h 36m 00s');
  });
});

describe('the lane heads and groups', () => {
  test('Ready holding more than one priority divides by priority, Building by whether an agent works, each head counting its group', () => {
    renderKanban('enabled', [], exampleBoard({
      tickets: [
        exampleTicket('700', { priority: 'high' }),
        exampleTicket('701'),
        exampleTicket('702'),
        exampleTicket('703', { status: 'in-progress' }),
        exampleTicket('704', { status: 'in-progress' }),
      ],
      displayStateById: { 704: 'paused' },
    }));
    const groupsOf = (title: string) => [...laneNamed(title).querySelectorAll('.board-lane-group')].map((group) => group.textContent);
    expect(groupsOf('Ready')).toEqual(['High 1', 'Normal 2']);
    expect(groupsOf('Building')).toEqual(['Building 1', 'Paused 1']);
    expect(laneNamed('Building').querySelector('.board-lane-head')?.getAttribute('title')).toBe('• 1 in progress · ○ 1 paused');
  });

  test('the Merge queue lane links to the queue\'s own detail', () => {
    renderKanban();
    expect(within(laneNamed('Merge queue')).getByRole('link', { name: 'Merge queue details' }).getAttribute('href')).toBe(MERGE_QUEUE_HREF);
  });
});

describe('the finished-work window', () => {
  const CLOSED_BOARD = exampleBoard({
    tickets: [
      exampleTicket('800', { status: 'delivered', delivered: '2026-10-10T11:00:00+02:00' }),
      exampleTicket('801', { status: 'delivered', delivered: '2026-10-02T11:00:00+02:00' }),
    ],
  });
  const DAY_MILLISECONDS = 24 * 60 * 60 * MILLISECONDS_PER_SECOND;
  const CUTOFF_EPOCH_MILLISECONDS = EXAMPLE_NOW_EPOCH_MILLISECONDS - DAY_MILLISECONDS;
  const LAST_DAY: FinishedWorkWindow = { choice: '1d', cutoffEpochMilliseconds: CUTOFF_EPOCH_MILLISECONDS, nowEpochMilliseconds: EXAMPLE_NOW_EPOCH_MILLISECONDS };

  test('a closed lane shows what the window lets through, says how many it hides, and its show all widens the window', async () => {
    const kanban = renderKanbanWith({ initialBoard: CLOSED_BOARD, finishedWork: LAST_DAY });
    const done = laneNamed('Done');
    expect([...done.querySelectorAll('.design-system-mono-id')].map((id) => id.textContent)).toEqual(['#800']);
    expect(done.querySelector('.board-lane-count')?.textContent).toBe('1');
    expect(done.querySelector('.board-lane-hidden-line span')?.textContent).toBe('1 earlier hidden');
    await clicked(within(done).getByRole('button', { name: 'show all' }));
    expect(kanban.showAllFinishedAsk.count).toBe(1);
  });

  test('an empty closed lane says how far back the window reaches', () => {
    renderKanbanWith({ initialBoard: exampleBoard({ tickets: [] }), finishedWork: LAST_DAY });
    expect(within(laneNamed('Done')).getByText('Nothing done in the last day.')).toBeTruthy();
  });
});

test('the view is a workplace of Flint', () => {
  renderKanban();
  expect(screen.getByRole('region', { name: 'Kanban' }).hasAttribute('data-flint-workplace')).toBe(true);
});
