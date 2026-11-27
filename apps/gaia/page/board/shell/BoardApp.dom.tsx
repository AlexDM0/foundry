/**
 * The board's shell for one forge against fake services: the routed tab's view and no other, the board read again after `board-changed`, a
 * lost stream disabling every control, and one forge's board, its Flint with it, unmounted before another mounts, so the document never
 * holds two Flints (`.claude/rules/flint.md`).
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
import type { BoardDocument }                        from '../../@types/board/BoardDocument.ts';
import { FLINT_OVERLAY_ATTRIBUTE, type FlintHandle } from '../../lib/flint/FlintInterface.ts';

import { BOARD_TABS, type BoardRoute } from '../../shared/BoardRouter.ts';
import type { BoardServices }          from '../@types/BoardServices.ts';
import type { BoardTabViewTable }      from '../@types/BoardTabViewProps.ts';
import { Board }                       from '../Board.tsx';
import type { EventStreamHandlers }    from '../api/BoardEventStreamClient.ts';
import { useBoardSetupHead }           from '../shared/BoardSetupHead.ts';
import { CommandButton }               from '../shared/commands/CommandButton.tsx';
import { boardHrefOf }                 from '../testing/BoardRouteSurroundings.tsx';
import {
  boardStateFixture,
  exampleAgentJob,
  exampleAskingDecision,
  FIXTURE_NOW,
  FIXTURE_TRACKER_ID
} from '../testing/BoardStateFixture.ts';
import { entitiesStepBoardOf }                  from '../testing/EntitiesStepFixture.ts';
import { createManualFlintFrames }              from '../testing/ManualFlintFrames.ts';
import { pipelineBoardStateOf }                 from '../testing/PipelineFixture.ts';
import { STUB_TAB_VIEW_TEXT, stubTabViewsWith } from '../testing/StubTabViews.tsx';
import { WAITING_ATTENTION }                    from '../testing/WaitingOnUserFixture.ts';
import { BoardApp }                             from './BoardApp.tsx';
import { BOARD_TAB_VIEWS }                      from './BoardTabViews.tsx';

const OTHER_TRACKER_ID = 'other-tracker';

const MOVED_VIEW_TEXT = 'The moved Agents view';

/** Agents drawn by the board itself, with one control, so a spec reads both the view and whether controls may act. */
const AGENTS_MOVED: BoardTabViewTable = stubTabViewsWith({
  agents: ({ route }) => (
    <section aria-label={MOVED_VIEW_TEXT}>
      <span>{`${MOVED_VIEW_TEXT} at ${route.item ?? 'no item'}`}</span>
      <CommandButton label="Pause" command={{ boardCommandVersion: 3, kind: 'hephaestus-pause' }} />
    </section>
  ),
});

/** Kanban drawn by the board itself, so the detail panel opens over it. */
const KANBAN_MOVED: BoardTabViewTable = stubTabViewsWith({ kanban: () => <section aria-label="The moved Kanban view" /> });

interface FakeBoard {
  readonly services:      BoardServices;
  readonly followed:      string[];
  readonly storage:       Map<string, string>;
  readonly reads:         () => number;
  readonly stream:        () => EventStreamHandlers;
  readonly streamsClosed: () => number;
  readonly flintHandles:  (FlintHandle | null)[];
  readonly answerReads:   (board: BoardDocument) => Promise<void>;
}

/** Shares its log of Flint's handles across boards, so a spec reads the order in which two boards made and removed theirs. */
function fakeBoardOf(trackerId: string = FIXTURE_TRACKER_ID, flintHandles: (FlintHandle | null)[] = []): FakeBoard {
  const followed: string[] = [];
  const storage = new Map<string, string>();
  const pendingReads: ((board: BoardDocument) => void)[] = [];
  let readCount = 0;
  let handlers: EventStreamHandlers | null = null;
  let streamsClosed = 0;
  return {
    services: {
      trackerId,
      commandClient:       { send: () => Promise.resolve({ verdict: 'applied', outcome: 'done', result: { startedJobId: null, writtenVersionNumber: null } }) },
      pictureUploadClient: { upload: () => Promise.resolve({ verdict: 'unreachable' }) },
      readBoard:           () => {
        readCount += 1;
        return new Promise((resolve) => pendingReads.push((board) => resolve({ verdict: 'read', board })));
      },
      openEventStream: (streamHandlers) => {
        handlers = streamHandlers;
        return {
          close: () => {
            streamsClosed += 1;
          },
        };
      },
      followTranscript: () => ({ close: () => undefined }),
      followProfileLog: () => () => undefined,
      storage:          () => ({
        getItem:    (key) => storage.get(key) ?? null,
        setItem:    (key, value) => storage.set(key, value),
        removeItem: (key) => storage.delete(key),
      }),
      now:              () => FIXTURE_NOW,
      questionNotifier: {
        allowance:         () => 'denied',
        askAllowance:      () => Promise.resolve('denied'),
        notify:            () => undefined,
        setDocumentTitle:  () => undefined,
        baseDocumentTitle: 'Example board',
      },
      goTo: (fragment) => {
        followed.push(fragment);
      },
      flintFrameSource: createManualFlintFrames().frameSource,
      onFlintHandle:    (handle) => {
        flintHandles.push(handle);
      },
    },
    followed,
    storage,
    reads:  () => readCount,
    stream: () => {
      if (handlers === null) throw new Error('the board opened no event stream');
      return handlers;
    },
    streamsClosed: () => streamsClosed,
    flintHandles,
    answerReads:   async (board) => {
      await act(async () => {
        pendingReads.splice(0).forEach((answer) => answer(board));
        await Promise.resolve();
      });
    },
  };
}

/** The fixture board with a readable pipeline, so it shows every tab but those its tickets and epics leave out. */
function servingBoard(changes: Partial<BoardDocument> = {}): BoardDocument {
  return boardStateFixture({ pipeline: pipelineBoardStateOf('A5').pipeline, ...changes });
}

/** The page's own head as a forge view draws it over the board: where the setup stands, then the step bar it is handed. */
function PageHeadOverTheBoard() {
  const setupHead = useBoardSetupHead();
  if (setupHead === null) return <div role="banner" aria-label="Page head">Out of setup</div>;
  const { progress } = setupHead;
  return (
    <div role="banner" aria-label="Page head">
      {progress.stage === 'setting-up' ? `Step ${progress.stepNumber} of ${progress.stepCount}` : 'Not started'}
      {setupHead.stepBar}
    </div>
  );
}

function renderedBoard(fake: FakeBoard, route: BoardRoute | null, tabViews: BoardTabViewTable = stubTabViewsWith()): void {
  render(<BoardApp services={fake.services} route={route} project="Example Agency" tabViews={tabViews}><PageHeadOverTheBoard /></BoardApp>);
}

function pageHead(): HTMLElement {
  return screen.getByRole('banner', { name: 'Page head' });
}

function liveWith(fake: FakeBoard): void {
  act(() => fake.stream().onConnection('live'));
}

afterEach(() => {
  cleanup();
});

describe('the main area', () => {
  test('every tab of the board has its view, so no tab is left to anything but Gaia\'s board', () => {
    expect(Object.keys(BOARD_TAB_VIEWS).sort()).toEqual([...BOARD_TABS].sort());
  });

  test('the main area holds the routed tab\'s view and no other tab\'s', async () => {
    const fake = fakeBoardOf();
    renderedBoard(fake, { tab: 'tickets', item: null }, AGENTS_MOVED);
    await fake.answerReads(servingBoard());
    expect(screen.getByText(`${STUB_TAB_VIEW_TEXT} of tickets at no item`)).toBeDefined();
    expect(screen.queryByText(MOVED_VIEW_TEXT, { exact: false })).toBeNull();
  });

  test('a tab renders its view at the route, under the header and its tabs', async () => {
    const fake = fakeBoardOf();
    renderedBoard(fake, { tab: 'agents', item: 'J12' }, AGENTS_MOVED);
    await fake.answerReads(servingBoard());
    expect(screen.getByText(`${MOVED_VIEW_TEXT} at J12`)).toBeDefined();
    expect(screen.queryByText(STUB_TAB_VIEW_TEXT, { exact: false })).toBeNull();
    expect(screen.getAllByRole('link').filter((link) => link.classList.contains('design-system-tab')).length).toBeGreaterThan(0);
  });

  test('a route naming no tab opens the tab stored for this board, and the tab shown is stored', async () => {
    const fake = fakeBoardOf();
    fake.storage.set(`gaia:board:${FIXTURE_TRACKER_ID}:tab`, 'tickets');
    renderedBoard(fake, null);
    await fake.answerReads(servingBoard());
    expect(screen.getByText(`${STUB_TAB_VIEW_TEXT} of tickets at no item`)).toBeDefined();
    cleanup();
    renderedBoard(fake, { tab: 'agents', item: null });
    await fake.answerReads(servingBoard());
    expect(fake.storage.get(`gaia:board:${FIXTURE_TRACKER_ID}:tab`)).toBe('agents');
  });

  test('a ticket\'s documents, which a link alone opens, leave the stored tab as it was, so the board\'s bare address opens that tab', async () => {
    const fake = fakeBoardOf();
    fake.storage.set(`gaia:board:${FIXTURE_TRACKER_ID}:tab`, 'questions');
    renderedBoard(fake, { tab: 'documents', item: 'ticket/012/spec' });
    await fake.answerReads(servingBoard());
    expect(fake.storage.get(`gaia:board:${FIXTURE_TRACKER_ID}:tab`)).toBe('questions');
  });

  test('a stored Pipeline tab is kept while the first board is read, and opens once the board shows Pipeline', async () => {
    const fake = fakeBoardOf();
    fake.storage.set(`gaia:board:${FIXTURE_TRACKER_ID}:tab`, 'pipeline');
    renderedBoard(fake, null);
    expect(fake.storage.get(`gaia:board:${FIXTURE_TRACKER_ID}:tab`)).toBe('pipeline');
    await fake.answerReads(servingBoard());
    expect(screen.getByText(`${STUB_TAB_VIEW_TEXT} of pipeline at no item`)).toBeDefined();
    expect(fake.storage.get(`gaia:board:${FIXTURE_TRACKER_ID}:tab`)).toBe('pipeline');
  });
});

describe('the detail panel', () => {
  test('opens over a detail tab on the routed item, and × closes it through goTo', async () => {
    const fake = fakeBoardOf();
    renderedBoard(fake, { tab: 'kanban', item: 'ticket/3' }, KANBAN_MOVED);
    await fake.answerReads(servingBoard());
    expect(screen.getByRole('complementary', { name: 'Ticket #3' })).toBeDefined();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Close' }));
      await Promise.resolve();
    });
    expect(fake.followed.at(-1)).toBe(boardHrefOf('progress/kanban'));
  });

  test('opens over no tab that is not a detail tab', async () => {
    const fake = fakeBoardOf();
    renderedBoard(fake, { tab: 'assistant', item: 'ticket/3' });
    await fake.answerReads(servingBoard());
    expect(screen.queryByRole('complementary', { name: 'Ticket #3' })).toBeNull();
  });
});

describe('the header\'s tabs', () => {
  test('go to their route under the mounted forge through goTo', async () => {
    const fake = fakeBoardOf();
    renderedBoard(fake, { tab: 'kanban', item: null });
    await fake.answerReads(servingBoard());
    const tabs = screen.getAllByRole('link').filter((link) => link.classList.contains('design-system-tab'));
    expect(tabs[0]?.getAttribute('href')).toBe(boardHrefOf('tickets'));
    tabs[0]?.focus();
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'ArrowRight' });
    expect(fake.followed.at(-1)).toBe(boardHrefOf('progress/kanban'));
  });

  test('the Progress view shown is remembered for this board, and the Progress entry opens it from another tab', async () => {
    const fake = fakeBoardOf();
    renderedBoard(fake, { tab: 'gantt', item: null });
    await fake.answerReads(servingBoard());
    expect(fake.storage.get(`gaia:board:${FIXTURE_TRACKER_ID}:progress-view`)).toBe('gantt');
    cleanup();
    renderedBoard(fake, { tab: 'agents', item: null });
    await fake.answerReads(servingBoard());
    expect(screen.getByRole('link', { name: 'Progress Gantt' }).getAttribute('href')).toBe(boardHrefOf('progress/gantt'));
    cleanup();
    renderedBoard(fake, { tab: 'kanban', item: null });
    await fake.answerReads(servingBoard());
    expect(fake.storage.has(`gaia:board:${FIXTURE_TRACKER_ID}:progress-view`)).toBe(false);
  });
});

describe('the connection', () => {
  test('a lost stream disables every control, and a live one enables it again', async () => {
    const fake = fakeBoardOf();
    renderedBoard(fake, { tab: 'agents', item: null }, AGENTS_MOVED);
    await fake.answerReads(servingBoard());
    liveWith(fake);
    const pause = (): HTMLButtonElement => screen.getByRole('button', { name: 'Pause' });
    expect(pause().disabled).toBe(false);
    act(() => fake.stream().onConnection('down'));
    expect(pause().disabled).toBe(true);
    expect(screen.getByRole('alert').textContent).toContain('Hephaestus unreachable.');
    act(() => fake.stream().onConnection('live'));
    expect(pause().disabled).toBe(false);
  });

  test('the board is read at the start, again after board-changed, and again once a lost stream is live, and a part\'s event reads nothing', async () => {
    const fake = fakeBoardOf();
    renderedBoard(fake, { tab: 'kanban', item: null });
    expect(fake.reads()).toBe(1);
    await fake.answerReads(servingBoard({ project: 'Example Agency at first' }));
    liveWith(fake);
    act(() => fake.stream().onEvent({ boardVersion: 3, kind: 'part-changed', part: 'job' }));
    expect(fake.reads()).toBe(1);
    act(() => fake.stream().onEvent({ boardVersion: 3, kind: 'board-changed' }));
    expect(fake.reads()).toBe(2);
    await fake.answerReads(servingBoard({ project: 'Example Agency renamed' }));
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Example Agency renamed');
    act(() => fake.stream().onConnection('down'));
    act(() => fake.stream().onConnection('live'));
    expect(fake.reads()).toBe(3);
  });
});

describe('the board root', () => {
  test('remounts for another tracker id, closing the first board\'s stream and removing its Flint before the next one\'s is made', async () => {
    const flintHandles: (FlintHandle | null)[] = [];
    const first = fakeBoardOf(FIXTURE_TRACKER_ID, flintHandles);
    const second = fakeBoardOf(OTHER_TRACKER_ID, flintHandles);
    const servicesOf = (trackerId: string): BoardServices => (trackerId === FIXTURE_TRACKER_ID ? first.services : second.services);
    const boardFor = (trackerId: string) => (
      <Board trackerId={trackerId} route={{ tab: 'kanban', item: null }} project="Example Agency" servicesOf={servicesOf} tabViews={stubTabViewsWith()} />
    );
    const { rerender } = render(boardFor(FIXTURE_TRACKER_ID));
    await first.answerReads(servingBoard());
    expect(document.querySelectorAll(`[${FLINT_OVERLAY_ATTRIBUTE}]`)).toHaveLength(1);
    rerender(boardFor(OTHER_TRACKER_ID));
    await second.answerReads(servingBoard({ trackerId: OTHER_TRACKER_ID }));
    expect(first.streamsClosed()).toBe(1);
    expect(flintHandles.map((handle) => (handle === null ? 'removed' : 'made'))).toEqual(['made', 'removed', 'made']);
    expect(document.querySelectorAll(`[${FLINT_OVERLAY_ATTRIBUTE}]`)).toHaveLength(1);
    const tabs = screen.getAllByRole('link').filter((link) => link.classList.contains('design-system-tab'));
    expect(tabs[0]?.getAttribute('href')).toBe(`#forge/${OTHER_TRACKER_ID}/tickets`);
  });
});

describe('the questions', () => {
  const TWO_OPEN_QUESTIONS = {
    decisions:       [exampleAskingDecision({ id: 'E4', jobId: 'J12' }), exampleAskingDecision({ id: 'E5', jobId: 'J12', openedAt: '2026-10-29T11:55:00' })],
    openDecisionIds: ['E4', 'E5'],
  };

  test('the Questions tab is drawn by its view, and the open question shows in the panel beside it', async () => {
    const fake = fakeBoardOf();
    renderedBoard(fake, { tab: 'questions', item: null }, BOARD_TAB_VIEWS);
    await fake.answerReads(servingBoard());
    expect(screen.getByRole('heading', { level: 2, name: 'Questions' })).toBeDefined();
    expect(screen.getByRole('complementary').getAttribute('aria-label')).toBe('Question E4 from J12');
  });

  test('questions/<id> opens the panel at that open question once the board brings it', async () => {
    const fake = fakeBoardOf();
    renderedBoard(fake, { tab: 'questions', item: 'E5' }, BOARD_TAB_VIEWS);
    await fake.answerReads(servingBoard(TWO_OPEN_QUESTIONS));
    expect(screen.getByRole('complementary').getAttribute('aria-label')).toBe('Question E5 from J12');
  });

});

describe('the Kanban', () => {
  test('is drawn by its view under the filter line, and a card opens the detail panel over it through goTo', async () => {
    const fake = fakeBoardOf();
    renderedBoard(fake, { tab: 'kanban', item: null }, BOARD_TAB_VIEWS);
    await fake.answerReads(servingBoard());
    expect(screen.getByRole('region', { name: 'Kanban' })).toBeDefined();
    expect(document.querySelector('.board-filter-line')).not.toBeNull();
    await act(async () => {
      fireEvent.click(document.querySelector('.board-kanban-card[data-ticket-id="3"]') ?? document.body);
      await Promise.resolve();
    });
    expect(fake.followed.at(-1)).toBe(boardHrefOf('progress/kanban/ticket/3'));
    cleanup();
    renderedBoard(fake, { tab: 'kanban', item: 'ticket/3' }, BOARD_TAB_VIEWS);
    await fake.answerReads(servingBoard());
    expect(screen.getByRole('complementary', { name: 'Ticket #3' })).toBeDefined();
    expect(document.querySelector('.board-kanban-card[data-ticket-id="3"]')?.hasAttribute('data-selected')).toBe(true);
  });

  test('its head\'s count of the drafts that wait on User leads to Tickets\' In draft', async () => {
    const fake = fakeBoardOf();
    renderedBoard(fake, { tab: 'kanban', item: null }, BOARD_TAB_VIEWS);
    await fake.answerReads(servingBoard({ attention: WAITING_ATTENTION }));
    expect(screen.getByRole('link', { name: /drafts? waits? on you/u }).getAttribute('href')).toBe(boardHrefOf('tickets/in-draft'));
  });

  test('a header figure pointing at a lane outlines that lane', async () => {
    const fake = fakeBoardOf();
    renderedBoard(fake, { tab: 'kanban', item: null }, BOARD_TAB_VIEWS);
    await fake.answerReads(servingBoard());
    act(() => {
      fireEvent.click(screen.getByRole('link', { name: /agents working on Kanban/u }));
    });
    expect(screen.getByRole('region', { name: 'Building' }).hasAttribute('data-highlighted')).toBe(true);
  });

  test('its item merge-queue draws the Merge queue\'s detail in place of the lanes', async () => {
    const fake = fakeBoardOf();
    renderedBoard(fake, { tab: 'kanban', item: 'merge-queue' }, BOARD_TAB_VIEWS);
    await fake.answerReads(servingBoard());
    expect(screen.getByRole('region', { name: 'Merge queue' })).toBeDefined();
    expect(screen.queryByRole('region', { name: 'Kanban' })).toBeNull();
  });
});

describe('the pipeline', () => {
  test('a readable pipeline\'s Pipeline tab is drawn by its view, the live flow in its main area', async () => {
    const fake = fakeBoardOf();
    renderedBoard(fake, { tab: 'pipeline', item: null }, BOARD_TAB_VIEWS);
    await fake.answerReads(servingBoard());
    expect(screen.getByRole('region', { name: 'Pipeline' }).getAttribute('data-screen')).toBe('flow');
  });

  test('a board in setup shows the Pipeline tab alone and no header, the page\'s head holding the setup steps with the entities step', async () => {
    const fake = fakeBoardOf();
    renderedBoard(fake, null, BOARD_TAB_VIEWS);
    await fake.answerReads(entitiesStepBoardOf());
    expect(document.querySelector('.board-header')).toBeNull();
    expect(pageHead().textContent).toStartWith('Step 4 of 7');
    expect(within(within(pageHead()).getByRole('list', { name: 'Setup steps' })).getAllByRole('listitem').map((step) => step.textContent))
      .toEqual(expect.arrayContaining([expect.stringContaining('Entities')]));
    expect(screen.queryByRole('link', { name: 'Agents' })).toBeNull();
    expect(document.querySelector('.board-pipeline')?.getAttribute('data-screen')).toBe('setup-resume');
  });

  test('a board in setup routed at the entities step draws that step under the page\'s head with its setup steps', async () => {
    const fake = fakeBoardOf();
    renderedBoard(fake, { tab: 'pipeline', item: 'setup/entities' }, BOARD_TAB_VIEWS);
    await fake.answerReads(entitiesStepBoardOf());
    expect(screen.getByRole('heading', { name: 'The entities of Example Agency' })).toBeDefined();
    expect(within(pageHead()).getByRole('list', { name: 'Setup steps' })).toBeDefined();
  });

  test('before a setup record opens the page\'s head is told the setup has not started, and holds no step bar', async () => {
    const fake = fakeBoardOf();
    renderedBoard(fake, null, BOARD_TAB_VIEWS);
    await fake.answerReads(pipelineBoardStateOf('A0'));
    expect([pageHead().textContent, within(pageHead()).queryByRole('list', { name: 'Setup steps' })]).toEqual(['Not started', null]);
  });

  test('on the agent step that starts a setup, before a record opens, the page\'s head holds the setup steps with Agent current', async () => {
    const fake = fakeBoardOf();
    renderedBoard(fake, { tab: 'pipeline', item: 'setup/agent' }, BOARD_TAB_VIEWS);
    await fake.answerReads(pipelineBoardStateOf('A0'));
    expect(pageHead().textContent).toStartWith('Step 1 of 6');
    const steps = within(within(pageHead()).getByRole('list', { name: 'Setup steps' })).getAllByRole('listitem');
    expect(steps.findIndex((step) => step.getAttribute('aria-current') === 'step' || step.querySelector('[aria-current="step"]') !== null)).toBe(0);
    expect(document.querySelector('.board-pipeline')?.getAttribute('data-screen')).toBe('setup-start');
  });

  test('out of setup the page\'s head heads the board, told nothing of a setup, over the board\'s own header', async () => {
    const fake = fakeBoardOf();
    renderedBoard(fake, null);
    await fake.answerReads(servingBoard());
    expect(pageHead().textContent).toBe('Out of setup');
    expect(pageHead().compareDocumentPosition(document.querySelector('.board-header') as Node) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  test('in setup a job not launched for want of an agent raises no notice, while another notice still shows', async () => {
    const fake = fakeBoardOf();
    renderedBoard(fake, null, BOARD_TAB_VIEWS);
    const board = pipelineBoardStateOf('A0');
    await fake.answerReads({
      ...board,
      jobs:    [...board.jobs, exampleAgentJob({ id: 'J1', notLaunched: { cause: 'no-agent-chosen', programPath: null, text: 'no agent is chosen for this board' } })],
      notices: [
        {
          kind: 'agent-program-refused', facts: { jobId: 'J1', cause: 'no-agent-chosen' }, text: 'job J1 is not launched: no agent is chosen for this board', causeText: null
        },
        {
          kind: 'rounds-not-converging', facts: { ticketId: '042' }, text: 'Example: the rounds of #042 are not converging', causeText: null
        },
      ],
    });
    expect(screen.queryByText(/is not launched/u)).toBeNull();
    expect(screen.getByRole('list', { name: '1 notices' }).textContent).toBe('Example: the rounds of #042 are not converging');
  });
});
