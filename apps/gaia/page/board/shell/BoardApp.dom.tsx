/**
 * The board's shell for one forge against fake services, in a happy-dom document. What matters: a tab no view of the board draws renders no
 * view, its main area holding what the forge view puts there, while a moved tab renders its view and not that area; the header's tabs go to
 * their routes through `goTo` under the mounted forge; a lost stream disables every control; the board reads itself at the start and again
 * after `board-changed`; the stored tab opens a route naming none; a detail tab the board draws opens the detail panel on the routed item,
 * which closes through `goTo`, while an unmoved one opens none; and the board root, keyed by its tracker id, unmounts one forge's board,
 * its Flint with it, before it mounts another's, so the document never holds two Flints (`.claude/rules/flint.md`).
 */
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen
} from '@testing-library/react';
import {
  afterEach,
  describe,
  expect,
  test
} from 'bun:test';
import type { FlintHandle }        from 'flint';
import { FLINT_OVERLAY_ATTRIBUTE } from 'flint/SpriteHabitat';

import type { BoardDocument }                                 from '../../@types/board/BoardDocument.ts';
import type { BoardServices }                                 from '../@types/BoardServices.ts';
import { Board }                                              from '../Board.tsx';
import type { EventStreamHandlers }                           from '../api/BoardEventStreamClient.ts';
import { boardHrefOf }                                        from '../testing/BoardRouteSurroundings.tsx';
import { boardStateFixture, FIXTURE_NOW, FIXTURE_TRACKER_ID } from '../testing/BoardStateFixture.ts';
import { createManualFlintFrames }                            from '../testing/ManualFlintFrames.ts';
import { pipelineBoardStateOf }                               from '../testing/PipelineFixture.ts';
import { BoardApp }                                           from './BoardApp.tsx';
import type { BoardRoute }                                    from './BoardRouter.ts';
import type { BoardTabViewTable }                             from './BoardTabViews.tsx';
import { CommandButton }                                      from './CommandButton.tsx';

const OTHER_TRACKER_ID = 'other-tracker';

const UNMOVED_AREA_TEXT = 'The frame for an unmoved tab';

const MOVED_VIEW_TEXT = 'The moved Agents view';

/** Agents drawn by the board itself, with one control, so a spec reads both the view and whether controls may act. */
const AGENTS_MOVED: BoardTabViewTable = {
  agents: ({ route }) => (
    <section aria-label={MOVED_VIEW_TEXT}>
      <span>{`${MOVED_VIEW_TEXT} at ${route.item ?? 'no item'}`}</span>
      <CommandButton label="Pause" command={{ boardCommandVersion: 1, kind: 'overseer-pause' }} />
    </section>
  ),
};

/** Kanban drawn by the board itself, so the detail panel opens over it. */
const KANBAN_MOVED: BoardTabViewTable = { kanban: () => <section aria-label="The moved Kanban view" />, };

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
      commandClient:       { send: () => Promise.resolve({ verdict: 'applied', outcome: 'done', result: { startedJobId: null } }) },
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

function unmovedTabArea(route: BoardRoute) {
  return <p>{`${UNMOVED_AREA_TEXT} at ${route.tab}`}</p>;
}

function renderedBoard(fake: FakeBoard, route: BoardRoute | null, tabViews: BoardTabViewTable = {}): void {
  render(<BoardApp services={fake.services} route={route} project="Example Agency" unmovedTabArea={unmovedTabArea} tabViews={tabViews} />);
}

function liveWith(fake: FakeBoard): void {
  act(() => fake.stream().onConnection('live'));
}

afterEach(() => {
  cleanup();
});

describe('the main area', () => {
  test('a tab no view of the board draws renders no view, and its main area holds what the forge view puts there', async () => {
    const fake = fakeBoardOf();
    renderedBoard(fake, { tab: 'questions', item: 'E2' }, AGENTS_MOVED);
    await fake.answerReads(servingBoard());
    expect(screen.getByText(`${UNMOVED_AREA_TEXT} at questions`)).toBeDefined();
    expect(screen.queryByText(MOVED_VIEW_TEXT, { exact: false })).toBeNull();
  });

  test('a moved tab renders its view at the route, and not the area for an unmoved tab', async () => {
    const fake = fakeBoardOf();
    renderedBoard(fake, { tab: 'agents', item: 'J12' }, AGENTS_MOVED);
    await fake.answerReads(servingBoard());
    expect(screen.getByText(`${MOVED_VIEW_TEXT} at J12`)).toBeDefined();
    expect(screen.queryByText(UNMOVED_AREA_TEXT, { exact: false })).toBeNull();
  });

  test('with no tab view at all every tab shows the area for an unmoved tab, under the header and its tabs', async () => {
    const fake = fakeBoardOf();
    renderedBoard(fake, { tab: 'agents', item: null });
    await fake.answerReads(servingBoard());
    expect(screen.getByText(`${UNMOVED_AREA_TEXT} at agents`)).toBeDefined();
    expect(screen.getAllByRole('link').filter((link) => link.classList.contains('design-system-tab')).length).toBeGreaterThan(0);
  });

  test('a route naming no tab opens the tab stored for this board, and the tab shown is stored', async () => {
    const fake = fakeBoardOf();
    fake.storage.set(`gaia:board:${FIXTURE_TRACKER_ID}:tab`, 'tickets');
    renderedBoard(fake, null);
    await fake.answerReads(servingBoard());
    expect(screen.getByText(`${UNMOVED_AREA_TEXT} at tickets`)).toBeDefined();
    cleanup();
    renderedBoard(fake, { tab: 'agents', item: null });
    await fake.answerReads(servingBoard());
    expect(fake.storage.get(`gaia:board:${FIXTURE_TRACKER_ID}:tab`)).toBe('agents');
  });

  test('a stored Pipeline tab is kept while the first board is read, and opens once the board shows Pipeline', async () => {
    const fake = fakeBoardOf();
    fake.storage.set(`gaia:board:${FIXTURE_TRACKER_ID}:tab`, 'pipeline');
    renderedBoard(fake, null);
    expect(fake.storage.get(`gaia:board:${FIXTURE_TRACKER_ID}:tab`)).toBe('pipeline');
    await fake.answerReads(servingBoard());
    expect(screen.getByText(`${UNMOVED_AREA_TEXT} at pipeline`)).toBeDefined();
    expect(fake.storage.get(`gaia:board:${FIXTURE_TRACKER_ID}:tab`)).toBe('pipeline');
  });
});

describe('the detail panel', () => {
  test('opens over a detail tab the board draws on the routed item, and × closes it through goTo', async () => {
    const fake = fakeBoardOf();
    renderedBoard(fake, { tab: 'kanban', item: 'ticket/3' }, KANBAN_MOVED);
    await fake.answerReads(servingBoard());
    expect(screen.getByRole('complementary', { name: 'Ticket #3' })).toBeDefined();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Close' }));
      await Promise.resolve();
    });
    expect(fake.followed.at(-1)).toBe(boardHrefOf('kanban'));
  });

  test('opens over no tab the forge view still draws', async () => {
    const fake = fakeBoardOf();
    renderedBoard(fake, { tab: 'kanban', item: 'ticket/3' });
    await fake.answerReads(servingBoard());
    expect(screen.queryByRole('complementary')).toBeNull();
  });
});

describe('the header\'s tabs', () => {
  test('go to their route under the mounted forge through goTo', async () => {
    const fake = fakeBoardOf();
    renderedBoard(fake, { tab: 'kanban', item: null });
    await fake.answerReads(servingBoard());
    const tabs = screen.getAllByRole('link').filter((link) => link.classList.contains('design-system-tab'));
    expect(tabs[0]?.getAttribute('href')).toBe(boardHrefOf('kanban'));
    tabs[0]?.focus();
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'ArrowRight' });
    // No ticket of the fixture depends on another, so Waves is not shown and Progress follows the Kanban.
    expect(fake.followed.at(-1)).toBe(boardHrefOf('progress'));
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
    expect(screen.getByRole('alert').textContent).toContain('Overseer unreachable.');
    act(() => fake.stream().onConnection('live'));
    expect(pause().disabled).toBe(false);
  });

  test('the board is read at the start, again after board-changed, and again once a lost stream is live, and a part\'s event reads nothing', async () => {
    const fake = fakeBoardOf();
    renderedBoard(fake, { tab: 'kanban', item: null });
    expect(fake.reads()).toBe(1);
    await fake.answerReads(servingBoard({ project: 'Example Agency at first' }));
    liveWith(fake);
    act(() => fake.stream().onEvent({ boardVersion: 1, kind: 'part-changed', part: 'job' }));
    expect(fake.reads()).toBe(1);
    act(() => fake.stream().onEvent({ boardVersion: 1, kind: 'board-changed' }));
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
      <Board trackerId={trackerId} route={{ tab: 'kanban', item: null }} project="Example Agency" servicesOf={servicesOf} unmovedTabArea={unmovedTabArea} />
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
    expect(tabs[0]?.getAttribute('href')).toBe(`#forge/${OTHER_TRACKER_ID}/kanban`);
  });
});
