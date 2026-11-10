/**
 * The Kanban against a fake command client and a fake clock, in a happy-dom document. What matters: the six lanes with their counts;
 * the card anatomy (id, size mark, priority, type, tokens, epics, waiting-on, hold, no row, the drafts' marks, the footer stamp) as text,
 * a planted payload included; a card opens the ticket form, a filing draft the draft form, in place, and a control inside a card or a
 * click ending a text selection opens nothing; a waiting-on id brings the card it names into focus; a working card's stamp ticks while
 * the stream is live and holds still while it is down; a draft's Ready, the Ready lane's multi-select Ready, and a ready card's Hold,
 * Unhold and priority each post their `ControlCommand`; a refusal shows verbatim; the controls are disabled while the stream is down; the
 * filter menu's pressed epics narrow the lanes; a card whose state moved on the next board is marked changed for a moment; a header
 * figure's lane is outlined for a moment; a card's asks pill opens the question panel at its decision; and while a detail or the question
 * panel is open the board carries its panel room. Also: the lanes' priority and
 * state groups, "needed first" and `↦ N`, the hover marks and arrows (against stubbed card boxes, since happy-dom lays nothing out), the
 * Ready lane by wave, a closed lane's pages and the finished-work window's hidden line, and the Abandoned lane's fold, each choice stored
 * under its key.
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

import { PRODUCT_NAMES }                           from '../../../src/shared/constants/ProductNames.ts';
import type { KanbanBoardState }                   from '../../@types/KanbanBoardState.ts';
import type { CommandOutcome, ControlCommandBody } from '../../api/CommandClient.ts';
import { boardPreferenceStoreOf }                  from '../../preferences/PreferenceStore.ts';
import { BridgeClockContext, type BridgeClock }    from '../../shell/BridgeClock.ts';
import { ControlSurroundingsContext }              from '../../shell/ControlAvailability.ts';
import type { ControlAvailability }                from '../../shell/ControlAvailability.ts';
import { QuestionPanelShownContext }               from '../../shell/CoveringPanel.ts';
import type { DetailItem }                         from '../../shell/DetailRoute.ts';
import { FinishedWorkWindowContext }               from '../../shell/FinishedWorkWindow.ts';
import type { FinishedWorkWindow }                 from '../../shell/FinishedWorkWindow.ts';
import type { BridgeRoute }                        from '../../shell/HashRouter.ts';
import { QuestionPanelOpenerContext }              from '../../shell/QuestionPanelOpener.ts';
import { routedOnTab }                             from '../../testing/DetailRoutingFixture.ts';
import { EXAMPLE_NOW_EPOCH_MILLISECONDS }          from '../../testing/KanbanBoardFixture.ts';
import { exampleBoard, exampleTicket }             from '../../testing/KanbanBoardFixture.ts';
import { KanbanModel, type KanbanReadyOrder }      from './KanbanModel.ts';
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

const MERGE_QUEUE_HREF = '#kanban/merge-queue';

const SHOWING_ALL_FINISHED: FinishedWorkWindow = { choice: 'all', cutoffEpochMilliseconds: Number.NEGATIVE_INFINITY, nowEpochMilliseconds: EXAMPLE_NOW_EPOCH_MILLISECONDS };

const MILLISECONDS_PER_SECOND = 1000;

interface KanbanSurroundingsChoice {
  readonly availability?:         ControlAvailability;
  readonly storedEntries?:        readonly [string, string][];
  readonly initialBoard?:         KanbanBoardState;
  readonly streamIsLive?:         boolean;
  readonly finishedWork?:         FinishedWorkWindow;
  readonly openItem?:             DetailItem | null;
  readonly pressedChips?:         readonly string[];
  readonly readyOrder?:           KanbanReadyOrder;
  readonly laneHighlight?:        KanbanLaneHighlightRequest | null;
  readonly questionPanelIsShown?: boolean;
}

interface RenderedKanban {
  readonly sent:                    ControlCommandBody[];
  readonly storage:                 Map<string, string>;
  /** Every route an opener asked for, across rerenders. */
  readonly navigatedRoutes:         () => BridgeRoute[];
  readonly showAllFinishedAsk:      { count: number };
  readonly answerWith:              (outcome: CommandOutcome) => void;
  readonly rerender:                (boardState: KanbanBoardState, openItem?: DetailItem | null) => void;
  /** Moves the fake clock on by whole seconds, ticking every second and calling what fell due. */
  readonly advanceSeconds:          (seconds: number) => void;
  readonly laneHighlightTakenCount: () => number;
  /** Every decision an asks pill opened the question panel at, in order. */
  readonly openedDecisionIds:       string[];
}

function renderKanbanWith({
  availability = 'enabled', storedEntries = [], initialBoard = BOARD, streamIsLive = true, finishedWork = SHOWING_ALL_FINISHED, openItem = null,
  pressedChips = [], readyOrder = 'filed', laneHighlight = null, questionPanelIsShown = false
}: KanbanSurroundingsChoice): RenderedKanban {
  const openedDecisionIds: string[] = [];
  const sent: ControlCommandBody[] = [];
  const storage = new Map<string, string>(storedEntries);
  const showAllFinishedAsk = { count: 0 };
  let nextOutcome: CommandOutcome = { verdict: 'applied', outcome: 'done', result: null };
  let currentEpochMilliseconds = EXAMPLE_NOW_EPOCH_MILLISECONDS;
  const ticks = new Set<() => void>();
  const pendingCalls = new Set<{ readonly dueAt: number; readonly callback: () => void }>();
  let laneHighlightTakenCount = 0;
  const clock: BridgeClock = {
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
  const surroundings = {
    availability,
    commandClient: {
      send: (command: ControlCommandBody) => {
        sent.push(command);
        return Promise.resolve(nextOutcome);
      },
    },
    onInstallHeld: () => undefined,
  };
  const boardStore = boardPreferenceStoreOf('example-tracker', () => ({
    getItem:    (key) => storage.get(key) ?? null,
    setItem:    (key, value) => storage.set(key, value),
    removeItem: (key) => storage.delete(key),
  }));
  const routeLists: BridgeRoute[][] = [];
  const tree = (boardState: KanbanBoardState, shownItem: DetailItem | null = openItem) => {
    const routed = routedOnTab('kanban', (
      <KanbanView
        boardState={boardState}
        filters={KanbanModel.kanbanFilterModelOf(boardState, pressedChips, readyOrder)}
        boardStore={boardStore}
        streamIsLive={streamIsLive}
        mergeQueueHref={MERGE_QUEUE_HREF}
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
      <ControlSurroundingsContext.Provider value={surroundings}>
        <BridgeClockContext.Provider value={clock}>
          <FinishedWorkWindowContext.Provider value={finishedWork}>
            <QuestionPanelOpenerContext.Provider value={(decisionId) => openedDecisionIds.push(decisionId)}>
              <QuestionPanelShownContext.Provider value={questionPanelIsShown}>
                {routed.element}
              </QuestionPanelShownContext.Provider>
            </QuestionPanelOpenerContext.Provider>
          </FinishedWorkWindowContext.Provider>
        </BridgeClockContext.Provider>
      </ControlSurroundingsContext.Provider>
    );
  };
  const rendered = render(tree(initialBoard));
  return {
    sent,
    storage,
    navigatedRoutes: () => routeLists.flat(),
    showAllFinishedAsk,
    answerWith:      (outcome) => {
      nextOutcome = outcome;
    },
    rerender:       (boardState, shownItem) => rendered.rerender(tree(boardState, shownItem)),
    advanceSeconds: (seconds) => {
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

function renderKanban(availability: ControlAvailability = 'enabled', storedEntries: readonly [string, string][] = [], initialBoard: KanbanBoardState = BOARD): RenderedKanban {
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
  test('the six lanes show in order, each with its count, the drafts under their own head at the top of Ready', () => {
    renderKanban();
    const lanes = screen.getAllByRole('region').filter((region) => region.hasAttribute('data-lane'));
    expect(lanes.map((lane) => [lane.getAttribute('aria-label'), lane.querySelector('.bridge-lane-count')?.textContent])).toEqual([
      ['Ready', '5'],
      ['Building', '1'],
      ['In review', '0'],
      ['Merge queue', '0'],
      ['Done', '0'],
      ['Abandoned', '0'],
    ]);
    expect([...laneNamed('Ready').querySelectorAll('.bridge-lane-group')].map((head) => head.textContent)).toEqual(['Drafts 3', 'High 1', 'Normal 1']);
    expect(within(laneNamed('In review')).getByText('Nothing in review.')).toBeTruthy();
  });

  test('a card shows its id, size mark, priority, type, epics, waiting-on and hold, and its tokens', () => {
    renderKanban();
    const card = cardNamed('#003');
    expect(card.querySelector('.bridge-ticket-id')?.textContent).toBe('#003');
    const size = card.querySelector('.bridge-kanban-size');
    expect([size?.textContent, size?.getAttribute('data-size'), size?.getAttribute('title')]).toEqual(['L', 'L', 'Size L']);
    expect(card.querySelector('.bridge-priority-mark')?.textContent).toBe('high');
    expect(card.querySelector('.bridge-type-mark')?.textContent).toBe('bug');
    expect(card.querySelector('.bridge-epic-chip')?.textContent).toBe('Example checkout');
    const held = cardNamed('#004');
    expect(held.querySelector('.bridge-waiting-on')?.textContent).toBe('waiting on #003');
    expect(held.querySelector('.bridge-kanban-held')?.getAttribute('title')).toBe('Held: waiting on the example vendor');
    expect(cardNamed('#005').querySelector('.bridge-kanban-tokens')?.textContent).toBe('2.5k tokens');
  });

  test('a normal-priority card shows no priority mark, and an unsized one no size mark', () => {
    renderKanban();
    expect(cardNamed('#005').querySelector('.bridge-priority-mark')).toBeNull();
    expect(cardNamed('#005').querySelector('.bridge-kanban-size')).toBeNull();
  });

  test('draft tickets and the filing draft leave the state line empty, the filing draft with its state line, neither with a row\'s bar', () => {
    renderKanban();
    expect(cardNamed('#001').querySelector('.bridge-kanban-state')?.textContent).toBe('');
    const filingDraft = cardNamed('Draft D7');
    expect(filingDraft.querySelector('.bridge-kanban-state')?.textContent).toBe('');
    expect([cardNamed('#001'), filingDraft].map((card) => [card.getAttribute('data-state'), card.getAttribute('data-row')])).toEqual([['draft', 'none'], ['draft', 'none']]);
    expect(filingDraft.querySelector('.bridge-kanban-note')?.textContent).toBe('Waiting on you · 2 open questions');
  });

  test('a planted payload in a title reaches the DOM only as text', () => {
    renderKanban();
    const card = cardNamed('#004');
    expect(card.querySelector('.bridge-kanban-title')?.textContent).toBe(PLANTED_TITLE);
    expect(card.querySelector('img')).toBeNull();
    expect((window as unknown as { plantedRan?: boolean }).plantedRan).toBeUndefined();
  });
});

describe('the controls', () => {
  test('a draft ticket\'s Ready posts ticket-ready for it, and a filing draft offers no Ready', async () => {
    const kanban = renderKanban();
    await clicked(within(cardNamed('#001')).getByRole('button', { name: 'Ready' }));
    expect(kanban.sent).toEqual([{ kind: 'ticket-ready', ticketReferences: ['001'] }]);
    expect(within(cardNamed('Draft D7')).queryByRole('button')).toBeNull();
  });

  test('the Ready lane\'s Ready selected waits for a selection, then posts one ticket-ready for every selected draft ticket', async () => {
    const kanban = renderKanban();
    const readySelected = within(laneNamed('Ready')).getByRole<HTMLButtonElement>('button', { name: 'Ready selected' });
    expect(readySelected.disabled).toBe(true);
    await clicked(screen.getByRole('checkbox', { name: 'Select #002' }));
    await clicked(screen.getByRole('checkbox', { name: 'Select #001' }));
    expect(readySelected.disabled).toBe(false);
    await clicked(readySelected);
    expect(kanban.sent).toEqual([{ kind: 'ticket-ready', ticketReferences: ['001', '002'] }]);
    expect(screen.queryAllByRole('checkbox').map((checkbox) => checkbox.getAttribute('aria-label'))).toEqual(['Select #001', 'Select #002']);
  });

  test('a ticket for review offers Ready on its card and in the Ready lane\'s Ready selected, each posting ticket-ready', async () => {
    const reviewTickets = [exampleTicket('011', { status: 'ready-for-review' }), exampleTicket('012', { status: 'ready-for-review' })];
    const kanban = renderKanban('enabled', [], exampleBoard({ tickets: reviewTickets }));
    await clicked(within(cardNamed('#011')).getByRole('button', { name: 'Ready' }));
    await clicked(screen.getByRole('checkbox', { name: 'Select #012' }));
    await clicked(within(laneNamed('Ready')).getByRole('button', { name: 'Ready selected' }));
    expect(kanban.sent).toEqual([
      { kind: 'ticket-ready', ticketReferences: ['011'] },
      { kind: 'ticket-ready', ticketReferences: ['012'] },
    ]);
  });

  test('a ready card posts ticket-hold, ticket-unhold and ticket-priority', async () => {
    const kanban = renderKanban();
    await clicked(within(cardNamed('#003')).getByRole('button', { name: 'Hold' }));
    await clicked(within(cardNamed('#004')).getByRole('button', { name: 'Unhold' }));
    await clicked(within(cardNamed('#003')).getByRole('button', { name: 'Priority low' }));
    expect(kanban.sent).toEqual([
      { kind: 'ticket-hold', ticketReference: '003', reason: '' },
      { kind: 'ticket-unhold', ticketReference: '004' },
      { kind: 'ticket-priority', ticketReference: '003', priority: 'low' },
    ]);
    expect(within(cardNamed('#003')).queryByRole('button', { name: 'Priority high' })).toBeNull();
    expect(within(cardNamed('#005')).queryAllByRole('button')).toEqual([]);
  });

  test('a refusal shows verbatim beside the control that drew it', async () => {
    const kanban = renderKanban();
    kanban.answerWith({ verdict: 'refused', refusal: 'Ticket 001 has no Brief: it cannot be readied.' });
    await clicked(within(cardNamed('#001')).getByRole('button', { name: 'Ready' }));
    expect(within(cardNamed('#001')).getByRole('status').textContent).toBe('Ticket 001 has no Brief: it cannot be readied.');
  });

  test('every card control is disabled while the stream is down', () => {
    renderKanban('stream-down');
    const buttons = screen.getAllByRole<HTMLButtonElement>('button').filter((button) => button.closest('.bridge-kanban-card') !== null);
    expect(buttons.length).toBeGreaterThan(0);
    expect(buttons.every((button) => button.disabled)).toBe(true);
  });
});

describe('the epic filter', () => {
  test('the pressed epics narrow the lanes to their tickets, and no chip row sits over the lanes', () => {
    renderKanbanWith({ pressedChips: ['billing'] });
    expect([...laneNamed('Ready').querySelectorAll('.bridge-kanban-card')].map((card) => card.getAttribute('aria-label'))).toEqual([
      'Draft D7 Example filing draft, Waiting on you · 2 open questions',
    ]);
    expect(laneNamed('Building').querySelectorAll('.bridge-kanban-card').length).toBe(1);
    expect(document.querySelector('.bridge-kanban .bridge-chips')).toBeNull();
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
    expect([...document.querySelectorAll('.bridge-lane[data-highlighted]')].map((lane) => lane.getAttribute('data-lane'))).toEqual(['building']);
    expect(kanban.laneHighlightTakenCount()).toBe(1);
    kanban.advanceSeconds(Math.ceil(LANE_HIGHLIGHT_MILLISECONDS / MILLISECONDS_PER_SECOND));
    expect(document.querySelectorAll('.bridge-lane[data-highlighted]').length).toBe(0);
  });
});

describe('the panel room', () => {
  test('while a detail is open the board carries its room and the frame its cover, and both go once it closes', () => {
    const kanban = renderKanbanWith({ openItem: { form: 'ticket', ticketId: '003' } });
    const lanes = document.querySelector('.bridge-kanban-lanes');
    expect(lanes?.hasAttribute('data-panel-room')).toBe(true);
    expect((lanes as HTMLElement | null)?.style.getPropertyValue('--panel-room')).toBe('0px');
    expect((document.querySelector('.bridge-kanban-frame') as HTMLElement | null)?.style.getPropertyValue('--panel-cover')).toBe('0px');
    act(() => kanban.rerender(BOARD, null));
    expect(lanes?.hasAttribute('data-panel-room')).toBe(false);
  });

  test('while the question panel shows the board carries its room too', () => {
    renderKanbanWith({ questionPanelIsShown: true });
    expect(document.querySelector('.bridge-kanban-lanes')?.hasAttribute('data-panel-room')).toBe(true);
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
    expect(cardNamed('#110').querySelector('.bridge-kanban-needed-first')?.textContent).toBe('needed first');
    expect(cardNamed('#113').querySelector('.bridge-kanban-needed-first')).toBeNull();
    const heldCount = cardNamed('#110').querySelector('.bridge-kanban-held-count');
    expect([heldCount?.textContent, heldCount?.getAttribute('title')]).toEqual(['↦ 2', '2 tickets wait on this one, directly or further down the chain']);
    expect(cardNamed('#113').querySelector('.bridge-kanban-held-count')).toBeNull();
    expect(document.querySelectorAll('[data-needed-first]').length).toBe(0);
  });

  test('hovering a card marks the cards it depends on needed first and draws an arrow from each, and leaving the board removes both', () => {
    layOutCards();
    renderKanban('enabled', [], DEPENDENCY_BOARD);
    act(() => {
      fireEvent.mouseOver(cardNamed('#112').querySelector('.bridge-kanban-title') ?? cardNamed('#112'));
    });
    expect([...document.querySelectorAll('[data-needed-first]')].map((card) => card.getAttribute('data-card'))).toEqual(['ticket:110', 'ticket:111']);
    const arrows = [...document.querySelectorAll('.bridge-kanban-arrows g')];
    expect(arrows.map((arrow) => arrow.getAttribute('data-route'))).toEqual(['same-lane', 'leftward']);
    expect(arrows.every((arrow) => arrow.querySelector('.bridge-kanban-arrow-line')?.getAttribute('d')?.startsWith('M ') === true)).toBe(true);
    act(() => {
      fireEvent.mouseLeave(document.querySelector('.bridge-kanban-frame') ?? document.body);
    });
    expect(document.querySelector('.bridge-kanban-arrows')).toBeNull();
    expect(document.querySelectorAll('[data-needed-first]').length).toBe(0);
  });
});

describe('the Ready lane by wave', () => {
  test('a board without dependencies stays filed, whatever order was asked', () => {
    renderKanbanWith({ readyOrder: 'by-wave' });
    expect(laneNamed('Ready').querySelector('.bridge-lane-wave')).toBeNull();
    expect(screen.queryByRole('group', { name: 'Order Ready' })).toBeNull();
  });

  test('by wave divides the Ready lane into its waves, the one-ticket ones narrow', () => {
    renderKanbanWith({ initialBoard: DEPENDENCY_BOARD, readyOrder: 'by-wave' });
    const waves = [...laneNamed('Ready').querySelectorAll('.bridge-lane-wave')];
    expect(waves.map((wave) => [
      wave.querySelector('.bridge-lane-group')?.textContent,
      wave.hasAttribute('data-narrow'),
      [...wave.querySelectorAll('.bridge-ticket-id')].map((id) => id.textContent),
    ])).toEqual([
      ['Now 1 ready · 2 side by side', false, ['#110']],
      ['Wave 2 one at a time', true, ['#112']],
      ['Wave 3 one at a time', true, ['#113']],
    ]);
  });
});

describe('the closed lanes\' pages', () => {
  const STORAGE_KEY = `${PRODUCT_NAMES.STORAGE_PREFIX}:example-tracker:kanban-done-shown`;
  const deliveredStampOf = (minute: number) => `2026-10-01T10:${String(minute).padStart(2, '0')}:00+02:00`;
  const deliveredTickets = Array.from({ length: 20 }, (_ticket, i) => exampleTicket(String(400 + i), { status: 'delivered', delivered: deliveredStampOf(i) }));
  const DONE_BOARD = exampleBoard({ tickets: deliveredTickets });

  test('a closed lane shows its first page and counts every card; Show more adds the rest and Latest goes back to the first page', async () => {
    const kanban = renderKanban('enabled', [], DONE_BOARD);
    const done = laneNamed('Done');
    expect(done.querySelector('.bridge-lane-count')?.textContent).toBe('20');
    expect(done.querySelectorAll('.bridge-kanban-card').length).toBe(15);
    expect(done.querySelector('.bridge-lane-more span')?.textContent).toBe('15 of 20 shown');
    await clicked(within(done).getByRole('button', { name: 'Show 5 more' }));
    expect(done.querySelectorAll('.bridge-kanban-card').length).toBe(20);
    expect(kanban.storage.get(STORAGE_KEY)).toBe('20');
    await clicked(within(done).getByRole('button', { name: 'Latest 15' }));
    expect(done.querySelectorAll('.bridge-kanban-card').length).toBe(15);
    expect(kanban.storage.has(STORAGE_KEY)).toBe(false);
  });
});

describe('the Abandoned lane\'s fold', () => {
  const STORAGE_KEY = `${PRODUCT_NAMES.STORAGE_PREFIX}:example-tracker:kanban-abandoned`;
  const ABANDONED_BOARD = exampleBoard({ tickets: [exampleTicket('500', { status: 'abandoned', abandonedAt: '2026-10-02T10:00:00+02:00' })] });

  test('the Abandoned lane is folded to its head and count until opened, and the choice is stored under its key', async () => {
    const kanban = renderKanban('enabled', [], ABANDONED_BOARD);
    const abandoned = laneNamed('Abandoned');
    expect(abandoned.hasAttribute('data-collapsed')).toBe(true);
    expect(abandoned.querySelector('.bridge-lane-count')?.textContent).toBe('1');
    expect(abandoned.querySelector('.bridge-kanban-card')).toBeNull();
    const toggle = within(abandoned).getByRole('button', { name: 'Show the abandoned tickets' });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    await clicked(toggle);
    expect(abandoned.hasAttribute('data-collapsed')).toBe(false);
    expect(abandoned.querySelectorAll('.bridge-kanban-card').length).toBe(1);
    expect(within(abandoned).getByRole('button', { name: 'Collapse the abandoned tickets' }).getAttribute('aria-expanded')).toBe('true');
    expect(kanban.storage.get(STORAGE_KEY)).toBe('open');
  });

  test('a stored open choice is read back on render', () => {
    renderKanban('enabled', [[STORAGE_KEY, 'open']], ABANDONED_BOARD);
    expect(laneNamed('Abandoned').querySelectorAll('.bridge-kanban-card').length).toBe(1);
  });
});

describe('opening a card', () => {
  test('a ticket card opens the ticket form over the Kanban, by click, Enter or Space; a second click on the open card closes it', () => {
    const kanban = renderKanban();
    fireEvent.click(cardNamed('#003').querySelector('.bridge-kanban-title') ?? cardNamed('#003'));
    fireEvent.keyDown(cardNamed('#005'), { key: 'Enter' });
    fireEvent.keyDown(cardNamed('#004'), { key: ' ' });
    expect(kanban.navigatedRoutes()).toEqual([
      { tab: 'kanban', item: 'ticket/003' },
      { tab: 'kanban', item: 'ticket/005' },
      { tab: 'kanban', item: 'ticket/004' },
    ]);
  });

  test('a filing draft opens the draft form, and the open card is marked selected', () => {
    const kanban = renderKanbanWith({ openItem: { form: 'ticket', ticketId: '003' } });
    expect(document.querySelectorAll('[data-selected]').length).toBe(1);
    expect(cardNamed('#003').hasAttribute('data-selected')).toBe(true);
    fireEvent.click(cardNamed('Draft D7'));
    fireEvent.click(cardNamed('#003'));
    expect(kanban.navigatedRoutes()).toEqual([{ tab: 'kanban', item: 'draft/D7' }, { tab: 'kanban', item: null }]);
  });

  test('a control, an epic chip or a key pressed inside a card opens nothing', async () => {
    const kanban = renderKanban();
    await clicked(within(cardNamed('#003')).getByRole('button', { name: 'Hold' }));
    fireEvent.click(cardNamed('#003').querySelector('.bridge-epic-chip') ?? document.body);
    fireEvent.keyDown(within(cardNamed('#003')).getByRole('button', { name: 'Hold' }), { key: 'Enter' });
    expect(kanban.navigatedRoutes()).toEqual([]);
  });

  test('a click that ends a text selection opens nothing', () => {
    const kanban = renderKanban();
    const title = cardNamed('#003').querySelector('.bridge-kanban-title') ?? document.body;
    const selection = window.getSelection();
    selection?.selectAllChildren(title);
    fireEvent.click(title);
    selection?.removeAllRanges();
    expect(kanban.navigatedRoutes()).toEqual([]);
  });

  test('a waiting-on id brings the card it names into focus instead of following its link', () => {
    const kanban = renderKanban();
    const link = within(cardNamed('#004')).getByRole('link', { name: '#003' });
    expect(link.getAttribute('href')).toBe('#kanban/ticket/003');
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
    expect(card.querySelector('.bridge-kanban-stamp')?.textContent).toBe('building 2h 36m 00s');
    kanban.advanceSeconds(2);
    expect(card.querySelector('.bridge-kanban-stamp')?.textContent).toBe('building 2h 36m 02s');
    expect([card.hasAttribute('data-live'), cardNamed('#601').hasAttribute('data-live')]).toEqual([true, false]);
    expect(cardNamed('#601').querySelector('.bridge-kanban-stamp')?.textContent).toBe('filed 10-01 09:00');
  });

  test('while the stream is down the stamp holds still', () => {
    const kanban = renderKanbanWith({ initialBoard: LIVE_BOARD, streamIsLive: false });
    kanban.advanceSeconds(2);
    expect(cardNamed('#600').querySelector('.bridge-kanban-stamp')?.textContent).toBe('building 2h 36m 00s');
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
    const groupsOf = (title: string) => [...laneNamed(title).querySelectorAll('.bridge-lane-group')].map((group) => group.textContent);
    expect(groupsOf('Ready')).toEqual(['Drafts 1', 'High 1', 'Normal 2']);
    expect(groupsOf('Building')).toEqual(['Building 1', 'Paused 1']);
    expect(laneNamed('Building').querySelector('.bridge-lane-head')?.getAttribute('title')).toBe('• 1 in progress · ○ 1 paused');
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
    expect([...done.querySelectorAll('.bridge-ticket-id')].map((id) => id.textContent)).toEqual(['#800']);
    expect(done.querySelector('.bridge-lane-count')?.textContent).toBe('1');
    expect(done.querySelector('.bridge-lane-hidden-line span')?.textContent).toBe('1 earlier hidden');
    await clicked(within(done).getByRole('button', { name: 'show all' }));
    expect(kanban.showAllFinishedAsk.count).toBe(1);
  });

  test('an empty closed lane says how far back the window reaches', () => {
    renderKanbanWith({ initialBoard: exampleBoard({ tickets: [] }), finishedWork: LAST_DAY });
    expect(within(laneNamed('Done')).getByText('Nothing done in the last day.')).toBeTruthy();
  });
});
