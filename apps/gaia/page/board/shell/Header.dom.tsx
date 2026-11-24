/**
 * The header in a mounted board. What matters: the title row carries Forge's mark, the wordmark and the project as the one `h1`, and the
 * state pill reads Running with its dot only while live; the header offers no forge control and no theme button, which are Gaia's own
 * outside the board, and no concurrency field, which lives on the Agents tab; the status details read as one line; the figures link to
 * their tabs under the mounted forge, a lane's figure asks for its lane and the agents figure says what it counts; the arrow keys, Home and
 * End move along the tabs and go to them; the activity strip shows one chip per job holding a launch slot and none for a session job, the
 * counts and the slots in use in its head over the chips, and one flag for tickets in progress with no job, holds Flint's slot only on the
 * Kanban tab with no side panel open, cued by the first running chip, and ticks from the injected clock only while it is live; the Waiting
 * on User pill names the total and the escalated, opens its inbox in the served order with each action at its served target's route,
 * closes on Esc (handing the focus back), a pointer outside or a followed link, and its ages tick only while live; and the tabs count what
 * waits on User in their tones, with no badge at zero. In setup (no readable pipeline) the header holds only the brand, the title, the
 * Setting up pill, the new-code notice and the setup step bar, whose done steps show a check and link to their route, whose current step
 * is `aria-current="step"` and which says which step this is; with a pipeline set the Pipeline tab is last.
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
import type { ReactElement } from 'react';

import type { BoardDocument }                  from '../../@types/board/BoardDocument.ts';
import type { BoardJobDocument }               from '../../@types/board/BoardJobDocuments.ts';
import type { NotificationAllowance }          from '../../notifications/NotificationBoundary.ts';
import type { ConnectionState }                from '../api/BoardEventStreamClient.ts';
import { boardHrefOf, boardRouteSurroundings } from '../testing/BoardRouteSurroundings.tsx';
import {
  boardStateFixture,
  exampleAgentJob,
  FIXTURE_ASSISTANT_JOB,
  FIXTURE_BUILDER_JOB,
  FIXTURE_NOW
} from '../testing/BoardStateFixture.ts';
import { elementOf, flintHabitatSceneOf, placeAt } from '../testing/FlintHabitatScene.ts';
import { pipelineBoardStateOf }                    from '../testing/PipelineFixture.ts';
import { EXAMPLE_TIMESTAMP_SLICES }                from '../testing/TimestampSlicesFixture.ts';
import {
  nothingWaitingBoard,
  WAITING_ATTENTION,
  WAITING_FIXTURE_NOW,
  waitingOnUserBoard
} from '../testing/WaitingOnUserFixture.ts';
import type { QuestionNotifier }                from '../views/questions/QuestionAlerts.ts';
import type { BoardClock }                      from './BoardClock.ts';
import { BoardRouter, type BoardTab }           from './BoardRouter.ts';
import { Header }                               from './Header.tsx';
import { headerModelOf, type HeaderFigureLane } from './HeaderModel.ts';
import { WaitingOnUserModel }                   from './WaitingOnUserModel.ts';

const STILL_CLOCK: BoardClock = { now: () => FIXTURE_NOW, everySecond: () => () => undefined, after: () => () => undefined };

const NO_NOTIFIER: QuestionNotifier = {
  allowance:         () => 'denied',
  askAllowance:      () => Promise.resolve('denied'),
  notify:            () => undefined,
  setDocumentTitle:  () => undefined,
  baseDocumentTitle: 'Example board',
};

/** The fixture board with a readable pipeline, so the header is out of setup, and the changes given. */
function servingBoard(changes: Partial<BoardDocument> = {}): BoardDocument {
  return boardStateFixture({ pipeline: pipelineBoardStateOf('A5').pipeline, ...changes });
}

function tickingClock(startsAt: Date = FIXTURE_NOW): { clock: BoardClock; advance: (milliseconds: number) => void } {
  let now = startsAt.getTime();
  const ticks: (() => void)[] = [];
  return {
    clock: {
      now:         () => new Date(now),
      everySecond: (tick) => {
        ticks.push(tick);
        return () => {
          ticks.splice(ticks.indexOf(tick), 1);
        };
      },
      after: () => () => undefined,
    },
    advance: (milliseconds) => {
      now += milliseconds;
      ticks.forEach((tick) => tick());
    },
  };
}

interface HeaderSurroundings {
  readonly activityIsLive?:  boolean;
  readonly clock?:           BoardClock;
  readonly connection?:      ConnectionState;
  readonly onShowLane?:      (lane: HeaderFigureLane) => void;
  readonly notifier?:        QuestionNotifier;
  /** The board the pill and the tab counts read; without it the header shows no pill and no count. */
  readonly waitingBoard?:    BoardDocument;
  /** Every tab but Pipeline unless given: the board says nothing of a pipeline. */
  readonly shownTabs?:       readonly BoardTab[];
  /** The Kanban unless given. */
  readonly selectedTab?:     BoardTab;
  readonly sidePanelIsOpen?: boolean;
}

function headerElementOf(board: BoardDocument, surroundings: HeaderSurroundings, wrap: (view: ReactElement) => ReactElement): ReactElement {
  const { waitingBoard } = surroundings;
  const waitingOnUser = waitingBoard === undefined ? null : WaitingOnUserModel.waitingOnUserOf(waitingBoard);
  return wrap(
    <Header
      project="Example Agency"
      model={headerModelOf(board, FIXTURE_NOW, surroundings.connection ?? 'live')}
      selectedTab={surroundings.selectedTab ?? 'kanban'}
      shownTabs={surroundings.shownTabs ?? BoardRouter.shownTabsOf(null, null, null)}
      activityIsLive={surroundings.activityIsLive ?? true}
      sidePanelIsOpen={surroundings.sidePanelIsOpen ?? false}
      clock={surroundings.clock ?? STILL_CLOCK}
      {...(surroundings.onShowLane === undefined ? {} : { onShowLane: surroundings.onShowLane })}
      waitingOnUser={waitingOnUser}
      tabCounts={waitingBoard === undefined || waitingOnUser === null ? {} : WaitingOnUserModel.tabCountsOf(waitingBoard, waitingOnUser)}
      questionNotifier={surroundings.notifier ?? NO_NOTIFIER}
      timestampSlices={EXAMPLE_TIMESTAMP_SLICES}
    />,
  );
}

/** Renders the header in a mounted board; the result is every fragment it went to. */
function renderedHeader(board: BoardDocument, surroundings: HeaderSurroundings = {}): string[] {
  const routes = boardRouteSurroundings();
  render(headerElementOf(board, surroundings, routes.wrap));
  return routes.followed;
}

function renderedWaitingHeader(board: BoardDocument, surroundings: HeaderSurroundings = {}): string[] {
  return renderedHeader({ ...board, pipeline: servingBoard().pipeline }, { ...surroundings, waitingBoard: board });
}

afterEach(() => {
  cleanup();
});

describe('the title row', () => {
  test('Forge\'s mark and the wordmark, then the project as the page\'s one heading, then the state pill', () => {
    renderedHeader(servingBoard());
    const titleRow = document.querySelector('.board-head-title-row');
    expect(titleRow?.querySelector('.board-wordmark')?.textContent).toBe('forge');
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Example Agency');
    expect(document.querySelectorAll('h1').length).toBe(1);
    expect(screen.getByRole('img', { name: 'Forge' }).closest('.board-head-title-row')).toBe(titleRow);
  });

  test('the pill reads Running with its dot while live, and a quiet word without a dot otherwise', () => {
    renderedHeader(servingBoard());
    const runningPill = document.querySelector('.board-status-pill');
    expect([runningPill?.textContent, runningPill?.hasAttribute('data-running'), runningPill?.querySelector('.board-status-dot') === null]).toEqual([
      'Running', true, false,
    ]);
    cleanup();
    renderedHeader(servingBoard({ hephaestus: { state: 'serving', paused: true, codeVersion: 'code-1' } }));
    const pausedPill = document.querySelector('.board-status-pill');
    expect([pausedPill?.textContent, pausedPill?.hasAttribute('data-running'), pausedPill?.querySelector('.board-status-dot')]).toEqual(['Paused', false, null]);
  });
});

describe('the forge\'s controls and the status details', () => {
  test('the header offers no forge control and no theme button: both are Gaia\'s own, outside the board', () => {
    renderedHeader(servingBoard({
      notices: [{
        kind: 'new-code', facts: {}, text: 'Example: new code is on disk', causeText: null
      }]
    }));
    expect(['Pause', 'Resume', 'Restart', 'Stop Hephaestus'].map((name) => screen.queryByRole('button', { name }))).toEqual([null, null, null, null]);
    expect(screen.queryByRole('group', { name: 'Hephaestus controls' })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Theme/u })).toBeNull();
    expect(document.querySelector('.board-status-notice')?.textContent).toBe('Example: new code is on disk');
  });

  test('during a restart the status reads Restarting', () => {
    renderedHeader(servingBoard({ hephaestus: { state: 'restarting', paused: false, codeVersion: 'code-1' } }));
    expect(screen.getByText('Restarting')).toBeDefined();
  });

  test('shows the usage windows the facts carry as one line with one separator', () => {
    renderedHeader(pipelineBoardStateOf('header-both-usage-windows'));
    expect(document.querySelector('.board-status-details')?.textContent).toBe('5-hour window 14% · week 18%');
  });

  test('no observed usage window shows no usage segment and no placeholder', () => {
    renderedHeader(pipelineBoardStateOf('header-no-usage-windows'));
    expect(document.querySelector('.board-status-details')).toBeNull();
  });

  test('the header offers no concurrency field: the limit is set on the Agents tab', () => {
    renderedHeader(servingBoard());
    expect([screen.queryByLabelText('Concurrency limit'), screen.queryByRole('button', { name: 'Set' })]).toEqual([null, null]);
  });
});

describe('the figures and the tabs', () => {
  test('the lane figures open the Kanban, incidents their tab, tokens nothing, and no figure counts the open questions', () => {
    renderedHeader(servingBoard());
    expect(screen.getByRole('link', { name: 'Show 1 / 4 agents working on Kanban' }).getAttribute('href')).toBe(boardHrefOf('kanban'));
    expect(screen.queryByRole('link', { name: /open questions/u })).toBeNull();
    expect(screen.getByRole('link', { name: 'Show 0 open incidents on Assistant' }).getAttribute('href')).toBe(boardHrefOf('assistant'));
    expect(screen.queryByRole('link', { name: /tokens today/u })).toBeNull();
  });

  test('the agents figure explains what it counts in its title', () => {
    renderedHeader(servingBoard());
    expect(screen.getByRole('link', { name: /agents working/u }).getAttribute('title'))
      .toBe('Build and review jobs against the limit of 4; the Assistant and product-owner jobs do not count');
    expect(screen.getByRole('link', { name: /done today/u }).getAttribute('title')).toBeNull();
  });

  test('a lane\'s figure asks for its Kanban lane as it opens the tab, and a figure of no lane asks for none', () => {
    const lanes: HeaderFigureLane[] = [];
    renderedHeader(servingBoard(), { onShowLane: (lane) => lanes.push(lane) });
    for (const name of [/agents working/u, /done today/u, /waiting in queue/u, /open incidents/u]) fireEvent.click(screen.getByRole('link', { name }));
    expect(lanes).toEqual(['building', 'done', 'ready']);
  });

  test('the arrow keys, Home and End move to a tab, wrapping at the ends, and go to it under the mounted forge', () => {
    const followed = renderedHeader(servingBoard());
    const tabs = screen.getAllByRole('link').filter((link) => link.classList.contains('design-system-tab'));
    const pressed = (key: string): void => {
      fireEvent.keyDown(document.activeElement ?? document.body, { key });
    };
    tabs[0]?.focus();
    pressed('ArrowRight');
    expect([document.activeElement?.textContent, followed.at(-1)]).toEqual(['Waves', boardHrefOf('waves')]);
    pressed('End');
    expect([document.activeElement?.textContent, followed.at(-1)]).toEqual(['Intake', boardHrefOf('intake')]);
    pressed('ArrowRight');
    expect([document.activeElement?.textContent, followed.at(-1)]).toEqual(['Kanban', boardHrefOf('kanban')]);
    pressed('ArrowLeft');
    pressed('Home');
    expect([document.activeElement?.textContent, followed.at(-1)]).toEqual(['Kanban', boardHrefOf('kanban')]);
  });

  test('the tabs follow the order given and mark the selected one', () => {
    renderedHeader(servingBoard());
    const tabs = screen.getAllByRole('link').filter((link) => link.classList.contains('design-system-tab'));
    expect(tabs.map((tab) => tab.textContent)).toEqual(['Kanban', 'Waves', 'Progress', 'Epics', 'Tickets', 'Agents', 'Questions', 'Assistant', 'Intake']);
    expect(tabs[0]?.getAttribute('aria-current')).toBe('page');
  });
});

describe('the activity strip', () => {
  const REVIEWER_JOB = exampleAgentJob({
    id: 'J14', kind: 'review', role: 'reviewer', ticketIds: ['4'], launchedAt: '2026-10-29T11:50:00'
  });

  const PRODUCT_OWNER_JOB = exampleAgentJob({
    id: 'J15', kind: 'product-owner', role: 'product-owner', ticketIds: [], launchedAt: '2026-10-29T11:00:00'
  });

  function stripBoard(jobs: readonly BoardJobDocument[], slotJobIds: readonly string[], inProgressTicketIdsWithoutJob: readonly string[] = []): BoardDocument {
    return servingBoard({ jobs, concurrency: { limit: 4, agentsInFlight: slotJobIds.length }, launchSlots: { limit: 4, slotJobIds, inProgressTicketIdsWithoutJob }, });
  }

  function strip(): HTMLElement {
    return screen.getByRole('status', { name: 'Agents at work' });
  }

  test('the strip shows one chip per slot job, with its id, role, ticket title and time, linking to the job on the Agents tab', () => {
    renderedHeader(stripBoard([FIXTURE_BUILDER_JOB, REVIEWER_JOB], ['J12', 'J14']));
    const chips = within(strip()).getAllByRole('link').filter((link) => link.classList.contains('board-activity-job'));
    expect(chips.map((chip) => [chip.textContent, chip.getAttribute('href'), chip.getAttribute('data-state')])).toEqual([
      ['J12builderExample in progress40m 00s', boardHrefOf('agents/J12'), 'in-progress'],
      ['J14reviewerExample waiting10m 00s', boardHrefOf('agents/J14'), 'reviewing'],
    ]);
    expect(screen.getByRole('link', { name: 'Job J12, builder, Example in progress' })).toBe(chips[0] as HTMLElement);
  });

  test('the Assistant and a product-owner job running beside the builders get no chip', () => {
    renderedHeader(stripBoard([FIXTURE_ASSISTANT_JOB, FIXTURE_BUILDER_JOB, PRODUCT_OWNER_JOB], ['J12']));
    expect([...document.querySelectorAll('.board-activity-job-id')].map((jobId) => jobId.textContent)).toEqual(['J12']);
  });

  test('the head reads the label, building and reviewing and the slots in use, over the chips', () => {
    renderedHeader(stripBoard([FIXTURE_BUILDER_JOB, REVIEWER_JOB], ['J12', 'J14']));
    const head = strip().querySelector('.board-activity-head');
    expect(head?.querySelector('.board-activity-counts')?.textContent).toBe('1building·1reviewing');
    expect(head?.textContent).toBe('Agents at work1building·1reviewing2 of 4 launch slots in use');
    expect(head?.nextElementSibling?.getAttribute('aria-label')).toBe('Worker jobs');
  });

  test('tickets in progress with no Hephaestus job show as one flag linking to the Agents tab, and no flag shows without them', () => {
    renderedHeader(stripBoard([FIXTURE_BUILDER_JOB], ['J12'], ['3', '4']));
    const flag = within(strip()).getByRole('link', { name: '2 in progress with no Hephaestus job' });
    expect([flag.getAttribute('href'), flag.getAttribute('data-tone'), flag.getAttribute('title')]).toEqual([
      boardHrefOf('agents'), 'warn', '2 tickets are in progress on the board with no Hephaestus job behind them',
    ]);
    cleanup();
    renderedHeader(stripBoard([FIXTURE_BUILDER_JOB], ['J12']));
    expect(within(strip()).queryByRole('link', { name: /no Hephaestus job/u })).toBeNull();
  });

  test('with no slot job it says no agent is working, and still flags tickets with no job', () => {
    renderedHeader(stripBoard([FIXTURE_ASSISTANT_JOB], [], ['3']));
    expect(strip().textContent).toBe('Agents at work0 of 4 launch slots in use1 in progress with no Hephaestus jobNo agent is working right now.');
    expect(strip().querySelector('.design-system-tag')?.getAttribute('title')).toBe('1 ticket is in progress on the board with no Hephaestus job behind it');
  });

  test('on the Kanban tab the strip opens with Flint\'s hidden 100px slot on the strip ground', () => {
    renderedHeader(stripBoard([REVIEWER_JOB, FIXTURE_BUILDER_JOB], ['J12', 'J14']));
    const flintSlot = strip().querySelector('.design-system-flint-slot');
    expect(strip().firstElementChild).toBe(flintSlot);
    expect(['aria-hidden', 'data-size', 'data-ground'].map((name) => flintSlot?.getAttribute(name))).toEqual(['true', '100', 'strip']);
  });

  test('the strip\'s Flint slot cues Flint from the first running chip, and is idle once no chip runs', () => {
    const scene = flintHabitatSceneOf<BoardDocument>({
      storedHabitatKind: 'kanban-slot',
      viewOf:            (board) => headerElementOf(board, {}, boardRouteSurroundings().wrap),
      firstProps:        stripBoard([FIXTURE_BUILDER_JOB, REVIEWER_JOB], ['J12', 'J14']),
      placeView:         () => placeAt(elementOf('.board-activity .design-system-flint-slot'), 100, 100, 100, 100),
    });
    const waitingBuilder = exampleAgentJob({ ...FIXTURE_BUILDER_JOB, state: 'waiting-for-answer' });
    expect(scene.cuesReceived(() => scene.show(stripBoard([waitingBuilder, REVIEWER_JOB], ['J12', 'J14'])))).toEqual(['agent-reviews']);
    expect(scene.cuesReceived(() => scene.show(stripBoard([waitingBuilder], ['J12'])))).toEqual(['agent-is-idle']);
  });

  test('with a ticket detail or the question panel open over the Kanban the strip holds no Flint slot: the panel holds the page\'s one', () => {
    renderedHeader(stripBoard([FIXTURE_BUILDER_JOB], ['J12']), { sidePanelIsOpen: true });
    expect(strip().querySelector('.design-system-flint-slot')).toBeNull();
  });

  test('on any other tab the strip holds no Flint slot', () => {
    renderedHeader(stripBoard([FIXTURE_BUILDER_JOB], ['J12']), { selectedTab: 'agents' });
    expect(strip().querySelector('.design-system-flint-slot')).toBeNull();
  });

  test('a live strip ticks each second from the injected clock', () => {
    const { clock, advance } = tickingClock();
    renderedHeader(stripBoard([FIXTURE_BUILDER_JOB], ['J12']), { clock });
    expect(strip().querySelector('.board-activity-job-elapsed')?.textContent).toBe('40m 00s');
    act(() => advance(2000));
    expect(strip().querySelector('.board-activity-job-elapsed')?.textContent).toBe('40m 02s');
  });

  test('a strip whose stream is down keeps its times still', () => {
    const { clock, advance } = tickingClock();
    renderedHeader(stripBoard([FIXTURE_BUILDER_JOB], ['J12']), { activityIsLive: false, clock });
    act(() => advance(2000));
    expect(strip().querySelector('.board-activity-job-elapsed')?.textContent).toBe('40m 00s');
  });
});

describe('waiting on User', () => {
  function pill(): HTMLElement {
    return screen.getByRole('button', { name: /^Waiting on User/u });
  }

  function inbox(): HTMLElement {
    return screen.getByRole('dialog', { name: 'Waiting on User' });
  }

  function opened(): void {
    act(() => {
      fireEvent.click(pill());
    });
  }

  test('the pill names the total and the escalated, rose with the red dot while an escalated item waits', () => {
    renderedWaitingHeader(waitingOnUserBoard(), { clock: STILL_CLOCK });
    expect([pill().getAttribute('aria-label'), pill().textContent, pill().getAttribute('data-state'), pill().getAttribute('aria-expanded')])
      .toEqual(['Waiting on User: 8, 1 escalated', 'Waiting on User·8', 'ready-for-review', 'false']);
    expect(pill().querySelector('.board-attention-pill-dot')).not.toBeNull();
    cleanup();
    renderedWaitingHeader(waitingOnUserBoard({ attention: WAITING_ATTENTION.filter((entry) => entry.kind !== 'escalated-question') }));
    expect(pill().querySelector('.board-attention-pill-dot')).toBeNull();
  });

  test('a click opens the inbox, its rows in the model\'s order with their actions, the escalated row first and primary, and focuses its action', () => {
    renderedWaitingHeader(waitingOnUserBoard(), { clock: tickingClock(WAITING_FIXTURE_NOW).clock });
    opened();
    expect(pill().getAttribute('aria-expanded')).toBe('true');
    const rows = within(inbox()).getAllByRole('listitem');
    expect(rows.map((row) => [row.querySelector('.board-ask-line .design-system-mono-id')?.textContent,
      row.querySelector('.board-ask-side a')?.textContent,
      row.querySelector('.board-ask-side a')?.getAttribute('href')])).toEqual([
      ['E3', 'Answer', boardHrefOf('questions/E3')],
      ['D2', 'Answer', boardHrefOf('kanban/draft/D2')],
      ['E2', 'Answer', boardHrefOf('questions/E2')],
      ['#009', 'Ready', boardHrefOf('kanban/ticket/009')],
      ['#006', 'Review', boardHrefOf('kanban/ticket/006')],
      ['#005', 'Accept', boardHrefOf('kanban/ticket/005')],
      ['#015', 'Ready', boardHrefOf('kanban/ticket/015')],
      ['E4', 'Answer', boardHrefOf('questions/E4')],
    ]);
    const escalatedAction = rows[0]?.querySelector('.board-ask-side a');
    expect([rows[0]?.hasAttribute('data-escalated'), escalatedAction?.hasAttribute('data-primary'), rows[1]?.querySelector('.board-ask-side a')?.hasAttribute('data-primary')])
      .toEqual([true, true, false]);
    expect(document.activeElement).toBe(escalatedAction ?? null);
    expect(rows[0]?.querySelector('.board-card-meta')?.textContent).toBe('asked by builder · job J3 · escalated by the Assistant from I2');
    expect(rows[0]?.querySelector('.design-system-stamp')?.textContent).toBe('40s');
  });

  test('Esc closes the inbox, is marked handled and hands the focus back to the pill', () => {
    renderedWaitingHeader(waitingOnUserBoard());
    opened();
    const escape = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    act(() => {
      document.activeElement?.dispatchEvent(escape);
    });
    expect([screen.queryByRole('dialog'), escape.defaultPrevented, document.activeElement]).toEqual([null, true, pill()]);
  });

  test('a pointer down outside closes the inbox, and so does following a link in it', () => {
    renderedWaitingHeader(waitingOnUserBoard());
    opened();
    act(() => {
      fireEvent.pointerDown(document.body);
    });
    expect(screen.queryByRole('dialog')).toBeNull();
    opened();
    act(() => {
      fireEvent.click(within(inbox()).getByRole('link', { name: 'All questions' }));
    });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  test('Drafts on Kanban asks for the Ready lane', () => {
    const lanes: HeaderFigureLane[] = [];
    renderedWaitingHeader(waitingOnUserBoard(), { onShowLane: (lane) => lanes.push(lane) });
    opened();
    act(() => {
      fireEvent.click(within(inbox()).getByRole('link', { name: 'Drafts on Kanban' }));
    });
    expect(lanes).toEqual(['ready']);
  });

  test('with nothing waiting the pill stays, neutral, and the inbox says nothing waits', () => {
    renderedWaitingHeader(nothingWaitingBoard());
    expect([pill().getAttribute('aria-label'), pill().hasAttribute('data-state')]).toEqual(['Waiting on User: none', false]);
    opened();
    expect([within(inbox()).getByText('Nothing waits on User.'), within(inbox()).queryAllByRole('listitem')]).toEqual([expect.anything(), []]);
  });

  test('the inbox asks for the notification allowance from a click while it is unasked, and the control goes once it is granted', async () => {
    let allowance: NotificationAllowance = 'default';
    const notifier: QuestionNotifier = {
      ...NO_NOTIFIER,
      allowance:    () => allowance,
      askAllowance: () => {
        allowance = 'granted';
        return Promise.resolve(allowance);
      },
    };
    renderedWaitingHeader(waitingOnUserBoard(), { notifier });
    opened();
    await act(async () => {
      fireEvent.click(within(inbox()).getByRole('button', { name: 'Notify me of new questions' }));
      await Promise.resolve();
    });
    expect(within(inbox()).queryByRole('button', { name: 'Notify me of new questions' })).toBeNull();
  });

  test('the ages tick each second from the injected clock while live, and stand still while the stream is down', () => {
    const live = tickingClock(WAITING_FIXTURE_NOW);
    renderedWaitingHeader(waitingOnUserBoard(), { clock: live.clock });
    opened();
    act(() => live.advance(2000));
    expect(inbox().querySelector('.design-system-stamp')?.textContent).toBe('42s');
    cleanup();
    const down = tickingClock(WAITING_FIXTURE_NOW);
    renderedWaitingHeader(waitingOnUserBoard(), { clock: down.clock, activityIsLive: false });
    opened();
    act(() => down.advance(2000));
    expect(inbox().querySelector('.design-system-stamp')?.textContent).toBe('40s');
  });
});

describe('the tab counts', () => {
  function tab(name: RegExp): HTMLElement {
    return screen.getAllByRole('link').find((link) => link.classList.contains('design-system-tab') && name.test(link.textContent ?? '')) ?? document.body;
  }

  test('Questions shows the escalated count with its dot, Kanban the rose count and the Assistant the grey one, each naming what it counts', () => {
    renderedWaitingHeader(waitingOnUserBoard());
    const badges = [/^Questions/u, /^Kanban/u, /^Assistant/u].map((name) => {
      const badge = tab(name).querySelector('.design-system-count-badge');
      return [tab(name).getAttribute('aria-label'),
        badge?.textContent,
        badge?.getAttribute('data-tone'),
        badge?.getAttribute('data-state-tone') ?? null,
        badge?.querySelector('.design-system-count-badge-dot') !== null];
    });
    expect(badges).toEqual([
      ['Questions, 3 questions wait on User, 1 escalated', '3', 'error', null, true],
      ['Kanban, 5 wait on User', '5', 'state', 'accent-outline', false],
      ['Assistant, 1 incident the Assistant is settling', '1', 'neutral', null, false],
    ]);
  });

  test('a tab with nothing to count shows no badge and keeps its label as its name', () => {
    renderedWaitingHeader(nothingWaitingBoard());
    expect(document.querySelectorAll('.design-system-tab .design-system-count-badge')).toHaveLength(0);
    expect(tab(/^Questions/u).hasAttribute('aria-label')).toBe(false);
  });
});

describe('the header in setup', () => {
  function renderedSetupHeader(board: BoardDocument): void {
    renderedHeader(board, { selectedTab: 'pipeline', shownTabs: BoardRouter.shownTabsOf(true, true, false), waitingBoard: waitingOnUserBoard() });
  }

  test('with no readable pipeline the tabs, statistics, pill, activity strip and forge controls are absent', () => {
    renderedSetupHeader(pipelineBoardStateOf('A0b-recheck'));
    expect(screen.queryByRole('navigation', { name: 'Views' })).toBeNull();
    expect(document.querySelector('.design-system-tabs')).toBeNull();
    expect(screen.queryByLabelText('Statistics')).toBeNull();
    expect(document.querySelector('.board-attention')).toBeNull();
    expect(document.querySelector('.board-activity')).toBeNull();
    expect(screen.queryByRole('group', { name: 'Hephaestus controls' })).toBeNull();
    const pill = document.querySelector('.board-status-pill');
    expect([pill?.textContent, pill?.querySelector('.board-status-dot')]).toEqual(['Setting up', null]);
  });

  test('the step bar shows the record\'s statuses, the current step is aria-current, and done and recheck steps link to their route', () => {
    renderedSetupHeader(pipelineBoardStateOf('A0b-recheck'));
    const stepper = screen.getByRole('list', { name: 'Setup steps' });
    expect(stepper.hasAttribute('data-compact')).toBe(true);
    const steps = [...stepper.querySelectorAll('.design-system-stepper-step')];
    expect(steps.map((step) => step.getAttribute('data-status'))).toEqual(['done', 'done', 'current', 'recheck', 'recheck', 'upcoming']);
    expect(steps.map((step) => step.querySelector('.design-system-stepper-check') !== null)).toEqual([true, true, false, false, false, false]);
    expect(steps.map((step) => step.querySelector('.design-system-stepper-circle') !== null)).toEqual([true, true, true, false, false, false]);
    expect(steps[2]?.getAttribute('aria-current')).toBe('step');
    expect(screen.getByText('Step 3 of 6 · saved as you go')).toBeDefined();
    expect(within(stepper).getByRole('link', { name: 'Billing' }).getAttribute('href')).toBe(boardHrefOf('pipeline/setup/billing'));
    expect(within(stepper).getByRole('link', { name: 'Constitution' }).getAttribute('href')).toBe(boardHrefOf('pipeline/setup/constitution'));
    expect(within(stepper).queryByRole('link', { name: 'Research' })).toBeNull();
    expect(within(stepper).queryByRole('link', { name: 'Apply' })).toBeNull();
  });

  test('a board without a record starts on Billing, and shows no usage', () => {
    renderedSetupHeader({ ...pipelineBoardStateOf('A0'), usage: pipelineBoardStateOf('header-both-usage-windows').usage });
    expect(screen.getByRole('list', { name: 'Setup steps' }).querySelector('[aria-current="step"]')?.textContent).toContain('Billing');
    expect(document.querySelector('.board-status-details')).toBeNull();
  });

  test('with new code on disk it shows the forge\'s new-code notice, though it offers no Restart', () => {
    renderedSetupHeader({
      ...pipelineBoardStateOf('A0'),
      notices: [{
        kind: 'new-code', facts: {}, text: 'Example: new code is on disk', causeText: null
      }]
    });
    expect(document.querySelector('.board-status-notice')?.textContent).toBe('Example: new code is on disk');
    expect(screen.queryByRole('button', { name: 'Restart' })).toBeNull();
  });
});

describe('the header with a pipeline set', () => {
  test('the Pipeline tab is last', () => {
    renderedHeader(pipelineBoardStateOf('A5'), { shownTabs: BoardRouter.shownTabsOf(true, true, true) });
    const tabs = [...within(screen.getByRole('navigation', { name: 'Views' })).getAllByRole('link')].map((tab) => tab.textContent);
    expect(tabs.at(-1)).toBe('Pipeline');
    expect(screen.queryByRole('list', { name: 'Setup steps' })).toBeNull();
  });
});
