/**
 * The shell against fake services, in a happy-dom document. What matters: every control is disabled while the event stream is down and
 * while launches are held for an install change, a 423 raises that banner with the Overseer's sentence, a refusal shows verbatim beside
 * its control and an unreachable Overseer is said there too, each refused command has Flint refuse, a refused session code or a lost
 * session raises the session banner in place of an empty board, a reconnect to an Overseer running new code reloads the page (also when
 * the identity fetch gave up at load, since the next connection asks again), each tab routes to its view, the root says whether the board
 * is live so every live animation follows the stream, the theme button stores and applies each choice in turn, a header chip links to its
 * job on the Agents tab and its flag opens that tab, the Waiting on User pill and the tab counts read the board the stream sends, Mark
 * defaults seen hands the focus to the panel, the question panel shows over every tab, hides behind a routed detail and closes on Esc only
 * after it, holds the page's one Flint slot over the Assistant, whose chat head gets its own back once it folds, renders no slot while it
 * hides behind a detail, also for a decision that arrives then, and the page draws one Flint, the live sprite, in no slot,
 * `#questions/<id>` points it at that question, a framed Kanban keeps its Agents-at-work strip with Flint's slot under a hidden title
 * row, a framed page's Esc leaves the board on any route no panel takes it on, the framing page hears `ready`, each route, `leave`
 * and `session-lost` in the embed channel's envelope with forge's system version and is followed on `navigate`, a message of another
 * channel version is answered by nothing, a board control in a frame shows the Overseer's refusal verbatim and posts
 * `session-lost` when its session token answers 401, and a view that throws leaves the error banner, not a blank page. The board's no-
 * pipeline question never covers the setup by itself. A board with no readable pipeline shows the Pipeline tab alone, routes there even
 * from a stored Kanban, and its header is in setup; a board with one shows Pipeline last and routes `#pipeline` to the view. Flint's brain
 * is wired through: a board whose brain runs gives Flint its director for the run's time left and a board where it ended takes it back,
 * and its controls are hidden for now: the mark's double click sends nothing and the Agents tab shows no brain card.
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

import type { FlintHandle }                                        from 'flint';
import { FLINT_OVERLAY_ATTRIBUTE }                                 from 'flint/SpriteHabitat';
import { FORGE_SYSTEM_VERSIONS }                                   from 'forge-contracts/ForgeSystemVersions';
import { PRODUCT_NAMES }                                           from '../../src/shared/constants/ProductNames.ts';
import type { BoardStateDocument, OverseerIdentity }               from '../@types/BoardStateDocument.ts';
import type { ConversationBoardDocument }                          from '../@types/ConversationDocuments.ts';
import type { CommandOutcome, ControlCommandBody }                 from '../api/CommandClient.ts';
import type { EventStreamHandlers }                                from '../api/EventStreamClient.ts';
import { exampleAgentJob }                                         from '../testing/BoardStateFixture.ts';
import { exampleDetailBoard, exampleDetailTicket }                 from '../testing/DetailBoardFixture.ts';
import { exampleFlintBrain, OFF_FLINT_BRAIN, runningFlintBrain }   from '../testing/FlintBrainFixture.ts';
import { exampleIncidentBoard }                                    from '../testing/IncidentNoticeFixture.ts';
import { createManualFlintFrames }                                 from '../testing/ManualFlintFrames.ts';
import { pageStylesheets }                                         from '../testing/PageStylesheets.ts';
import { pipelineBoardStateOf }                                    from '../testing/PipelineFixture.ts';
import { DARK_MODE_QUESTION }                                      from '../testing/QuestionPanelFixture.ts';
import { exampleTicketsBoard, exampleTicketsTicket }               from '../testing/TicketsBoardFixture.ts';
import { ESCALATED_DECISION, WAITING_TICKETS, waitingOnUserBoard } from '../testing/WaitingOnUserFixture.ts';
import { BridgeApp, FRESHNESS_ATTRIBUTE, type BridgeServices }     from './BridgeApp.tsx';
import { BridgeErrorBoundary }                                     from './BridgeErrorBoundary.tsx';
import { HashRouter }                                              from './HashRouter.ts';

const IDENTITY: OverseerIdentity = { trackerId: 'example-tracker', project: 'Example Agency', codeVersion: 'code-1' };

const BOARD: BoardStateDocument = {
  project:   'Example Agency',
  jobs:      [],
  decisions: [],
  incidents: [],
  overseer:  { state: 'serving', paused: false, codeVersion: 'code-1' },
  usage:     null,
};

interface FakeBridge {
  readonly services:     BridgeServices;
  readonly storage:      Map<string, string>;
  readonly stream:       () => EventStreamHandlers;
  readonly sent:         ControlCommandBody[];
  readonly reloads:      () => number;
  readonly answerWith:   (outcome: CommandOutcome) => void;
  readonly identityNext: (identity: OverseerIdentity | null) => void;
}

function fakeBridge(): FakeBridge {
  let handlers: EventStreamHandlers | null = null;
  let reloadCount = 0;
  let nextOutcome: CommandOutcome = { verdict: 'applied', outcome: 'done', result: null };
  let identity: OverseerIdentity | null = IDENTITY;
  const sent: ControlCommandBody[] = [];
  const storage = new Map<string, string>();
  return {
    services: {
      commandClient: {
        send: (command) => {
          sent.push(command);
          return Promise.resolve(nextOutcome);
        },
      },
      openEventStream: (streamHandlers) => {
        handlers = streamHandlers;
        return { close: () => undefined };
      },
      fetchIdentity: () => Promise.resolve(identity),
      reload:        () => {
        reloadCount += 1;
      },
      storage: () => ({
        getItem:    (key) => storage.get(key) ?? null,
        setItem:    (key, value) => storage.set(key, value),
        removeItem: (key) => storage.delete(key),
      }),
      embedMode:            null,
      embeddedSurroundings: () => ({ window, parent: null, parentOrigin: null }),
      now:                  () => new Date('2026-10-29T20:00:00Z'),
      followTranscript:     () => ({ close: () => undefined }),
      followProfileLog:     () => () => undefined,
      questionNotifier:     {
        allowance:         () => 'denied',
        askAllowance:      () => Promise.resolve('denied'),
        notify:            () => undefined,
        setDocumentTitle:  () => undefined,
        baseDocumentTitle: 'agent-progress',
      },
      flintFrameSource: createManualFlintFrames().frameSource,
    },
    storage,
    stream: () => {
      if (handlers === null) throw new Error('the shell opened no event stream');
      return handlers;
    },
    sent,
    reloads:    () => reloadCount,
    answerWith: (outcome) => {
      nextOutcome = outcome;
    },
    identityNext: (next) => {
      identity = next;
    },
  };
}

async function renderedLive(bridge: FakeBridge, board: unknown = BOARD): Promise<void> {
  render(<BridgeApp services={bridge.services} />);
  await act(async () => {
    bridge.stream().onConnection('live');
    bridge.stream().onEvent('board', board);
    await Promise.resolve();
  });
}

function pauseButton(): HTMLButtonElement {
  return screen.getByRole<HTMLButtonElement>('button', { name: 'Pause' });
}

afterEach(() => {
  cleanup();
  window.location.hash = '';
});

describe('the shell\'s controls', () => {
  test('a control posts its ControlCommand while the stream is live', async () => {
    const bridge = fakeBridge();
    await renderedLive(bridge);
    expect(pauseButton().disabled).toBe(false);
    await act(async () => {
      fireEvent.click(pauseButton());
      await Promise.resolve();
    });
    expect(bridge.sent).toEqual([{ kind: 'overseer-pause' }]);
  });

  test('every control is disabled while the stream is down, under the unreachable banner, and the board stays on screen', async () => {
    const bridge = fakeBridge();
    await renderedLive(bridge);
    act(() => bridge.stream().onConnection('down'));
    expect(pauseButton().disabled).toBe(true);
    expect(screen.getByRole('alert').textContent).toStartWith('Overseer unreachable.Reconnecting; showing the board as of ');
    expect(screen.getByRole('heading').textContent).toBe('Example Agency');
  });

  test('a 423 raises the install-change banner with the Overseer\'s sentence and disables every control', async () => {
    const bridge = fakeBridge();
    await renderedLive(bridge);
    bridge.answerWith({ verdict: 'install-held', refusal: 'The install version changed, so launches are held until the board is updated.' });
    await act(async () => {
      fireEvent.click(pauseButton());
      await Promise.resolve();
    });
    expect(screen.getByRole('alert').textContent).toBe('Launches held.The install version changed, so launches are held until the board is updated.');
    expect(pauseButton().disabled).toBe(true);
  });

  test('a board held for an install change disables every control too', async () => {
    const bridge = fakeBridge();
    await renderedLive(bridge);
    act(() => bridge.stream().onEvent('board', { ...BOARD, overseer: { ...BOARD.overseer, state: 'held-by-install-change' } }));
    expect(screen.getByRole('alert').textContent).toContain('The install version changed');
    expect(pauseButton().disabled).toBe(true);
  });

  test('a refusal shows verbatim beside its control', async () => {
    const bridge = fakeBridge();
    await renderedLive(bridge);
    bridge.answerWith({ verdict: 'refused', refusal: 'Ticket 042 is not ready: it has no Brief.' });
    await act(async () => {
      fireEvent.click(pauseButton());
      await Promise.resolve();
    });
    expect(screen.getByText('Ticket 042 is not ready: it has no Brief.').getAttribute('role')).toBe('status');
  });

  test('each command the Overseer refuses has Flint refuse, once for each refusal', async () => {
    const bridge = fakeBridge();
    const performed: string[] = [];
    const recordingFlint = (handle: FlintHandle | null): void => {
      if (handle === null) return;
      const carryOut = handle.perform;
      Object.assign(handle, {
        perform: (intent: string, toward?: Element) => {
          performed.push(intent);
          return toward === undefined ? carryOut(intent) : carryOut(intent, toward);
        },
      });
    };
    render(<BridgeApp services={{ ...bridge.services, onFlintHandle: recordingFlint }} />);
    await act(async () => {
      bridge.stream().onConnection('live');
      bridge.stream().onEvent('board', BOARD);
      await Promise.resolve();
    });
    bridge.answerWith({ verdict: 'refused', refusal: 'Ticket 042 is not ready: it has no Brief.' });
    for (let i = 0; i < 2; i++) {
      await act(async () => {
        fireEvent.click(pauseButton());
        await Promise.resolve();
      });
    }
    expect(performed).toEqual(['refuse', 'refuse']);
  });

  test('a command that reaches no Overseer says so beside its control', async () => {
    const bridge = fakeBridge();
    await renderedLive(bridge);
    bridge.answerWith({ verdict: 'unreachable' });
    await act(async () => {
      fireEvent.click(pauseButton());
      await Promise.resolve();
    });
    expect(screen.getByText('The Overseer could not be reached. Try again.').getAttribute('role')).toBe('status');
  });
});

describe('the header strip', () => {
  test('a chip names its job\'s route on the Agents tab, and the without-job flag opens the Agents tab with the job\'s row', async () => {
    const builder = exampleAgentJob({ id: 'J2', ticketIds: ['3'] });
    await renderedLive(fakeBridge(), {
      ...BOARD,
      jobs:        [builder],
      concurrency: { limit: 4, agentsInFlight: 1 },
      launchSlots: { limit: 4, slotJobIds: ['J2'], inProgressTicketIdsWithoutJob: ['5'] },
    });
    const chipHref = screen.getByRole('link', { name: 'Job J2, builder, J2' }).getAttribute('href') ?? '';
    expect(HashRouter.routeOf(chipHref, null)).toEqual({ tab: 'agents', item: 'J2' });
    const flag = screen.getByRole('link', { name: '1 in progress with no Overseer job' });
    await act(async () => {
      fireEvent.click(flag);
      window.location.hash = flag.getAttribute('href') ?? '';
      window.dispatchEvent(new HashChangeEvent('hashchange'));
      await Promise.resolve();
    });
    expect(screen.getByRole('link', { name: 'Agents' }).getAttribute('aria-current')).toBe('page');
    expect(document.querySelector('tr[data-job-id="J2"]')).not.toBeNull();
  });
});

describe('the root\'s freshness', () => {
  test('the root reads live while the stream is up and snapshot while it is down, and the mark goes with the shell', async () => {
    const bridge = fakeBridge();
    await renderedLive(bridge);
    expect(document.documentElement.getAttribute(FRESHNESS_ATTRIBUTE)).toBe('live');
    act(() => bridge.stream().onConnection('down'));
    expect(document.documentElement.getAttribute(FRESHNESS_ATTRIBUTE)).toBe('snapshot');
    cleanup();
    expect(document.documentElement.hasAttribute(FRESHNESS_ATTRIBUTE)).toBe(false);
  });
});

describe('the theme button', () => {
  test('a press stores the next choice and puts its theme on the root, and a press on dark goes back to auto, stored as nothing', async () => {
    const bridge = fakeBridge();
    const themeKey = `${PRODUCT_NAMES.STORAGE_PREFIX}:theme`;
    await renderedLive(bridge);
    act(() => fireEvent.click(screen.getByRole('button', { name: 'Theme: auto. Click for light.' })));
    expect([bridge.storage.get(themeKey), document.documentElement.getAttribute('data-theme')]).toEqual(['light', 'light']);
    act(() => fireEvent.click(screen.getByRole('button', { name: 'Theme: light. Click for dark.' })));
    expect([bridge.storage.get(themeKey), document.documentElement.getAttribute('data-theme')]).toEqual(['dark', 'dark']);
    act(() => fireEvent.click(screen.getByRole('button', { name: 'Theme: dark. Click for auto.' })));
    expect([bridge.storage.has(themeKey), document.documentElement.getAttribute('data-theme-choice')]).toEqual([false, 'auto']);
  });
});

describe('waiting on User', () => {
  test('a board with one escalated decision and one draft ticket shows Waiting on User · 2, the Questions badge escalated and the Kanban badge', async () => {
    const board = waitingOnUserBoard({ decisions: [ESCALATED_DECISION], incidents: [], mergeQueue: { targets: [] } });
    const { page } = board;
    if (page === undefined) throw new Error('the waiting board serves no page');
    await renderedLive(fakeBridge(), {
      ...board,
      page: {
        ...page,
        tickets: WAITING_TICKETS.filter((ticket) => ticket.id === '009'),
        payload: { ...page.payload, boardFacts: { ...page.payload.boardFacts, drafts: [] } },
      },
    });
    expect(screen.getByRole('button', { name: 'Waiting on User: 2, 1 escalated' }).textContent).toBe('Waiting on User·2');
    const questionsLink = screen.getByRole('link', { name: 'Questions, 1 question waits on User, 1 escalated' });
    expect(questionsLink.querySelector('.design-system-count-badge')?.getAttribute('data-tone')).toBe('error');
    expect(screen.getByRole('link', { name: 'Kanban, 1 waits on User' }).querySelector('.design-system-count-badge')?.textContent).toBe('1');
  });
});

describe('the session banner', () => {
  const OPEN_AGAIN = 'Open the board again.';

  test('A3: a refused session code shows that another process may have used it, in place of the wait for a board', () => {
    const bridge = fakeBridge();
    render(<BridgeApp services={bridge.services} sessionExchangeOutcome="refused" />);
    const banner = screen.getByRole('alert').textContent;
    expect(banner).toContain('already used or expired');
    expect(banner).toContain('another process may have used it');
    expect(banner).toEndWith(OPEN_AGAIN);
    expect(document.querySelector('.design-system-empty')).toBeNull();
  });

  test('A4: a stream with no session after a restart raises the banner over the shown board, disables controls, and a live stream clears it', async () => {
    const bridge = fakeBridge();
    await renderedLive(bridge);
    act(() => bridge.stream().onConnection('no-session'));
    expect(screen.getByRole('alert').textContent).toContain('no session with the Overseer');
    expect(screen.getByRole('alert').textContent).toEndWith(OPEN_AGAIN);
    expect(pauseButton().disabled).toBe(true);
    expect(screen.getByRole('heading').textContent).toBe('Example Agency');
    act(() => bridge.stream().onConnection('live'));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  test('A4: a command whose session token answers 401 raises the banner', async () => {
    const bridge = fakeBridge();
    await renderedLive(bridge);
    bridge.answerWith({ verdict: 'no-session' });
    await act(async () => {
      fireEvent.click(pauseButton());
      await Promise.resolve();
    });
    expect(screen.getByRole('alert').textContent).toEndWith(OPEN_AGAIN);
  });

  test('A5: a page opened with no code whose stream finds no session shows the banner, not the wait for a board', () => {
    const bridge = fakeBridge();
    render(<BridgeApp services={bridge.services} />);
    act(() => bridge.stream().onConnection('no-session'));
    expect(screen.getByRole('alert').textContent).toEndWith(OPEN_AGAIN);
    expect(document.querySelector('.design-system-empty')).toBeNull();
  });

  test('A3: a refused code stays shown when an older session cookie still opens a live stream, with the controls enabled', async () => {
    const bridge = fakeBridge();
    render(<BridgeApp services={bridge.services} sessionExchangeOutcome="refused" />);
    await act(async () => {
      bridge.stream().onConnection('live');
      bridge.stream().onEvent('board', BOARD);
      await Promise.resolve();
    });
    expect(screen.getByRole('alert').textContent).toContain('another process may have used it');
    expect(pauseButton().disabled).toBe(false);
  });

  test('a refused code keeps its own wording when the stream then finds no session', () => {
    const bridge = fakeBridge();
    render(<BridgeApp services={bridge.services} sessionExchangeOutcome="refused" />);
    act(() => bridge.stream().onConnection('no-session'));
    expect(screen.getByRole('alert').textContent).toContain('another process may have used it');
  });
});

describe('the incident line', () => {
  const INCIDENT_BOARD = exampleIncidentBoard();
  const SEEN_KEY = `${PRODUCT_NAMES.STORAGE_PREFIX}:example-tracker:seen-incident-defaults`;

  function boardWithDefaults(incidentBoard: ConversationBoardDocument, overseer: BoardStateDocument['overseer'] = BOARD.overseer): BoardStateDocument {
    return {
      ...BOARD, overseer, jobs: incidentBoard.jobs, incidents: incidentBoard.incidents, notices: incidentBoard.notices ?? [], questionHistory: incidentBoard.questionHistory
    } as BoardStateDocument;
  }

  function incidentLine(): HTMLElement | null {
    return document.querySelector('.bridge-incident-notice');
  }

  test('defaults are one incident line, apart from the warnings, after the connection banners and before the header', async () => {
    const bridge = fakeBridge();
    const batonPassWarning = { successorCodeVersion: 'code-2', step: 'prepared', error: 'the successor exited' };
    await renderedLive(bridge, boardWithDefaults(INCIDENT_BOARD, { ...BOARD.overseer, batonPassWarning }));
    act(() => bridge.stream().onConnection('down'));
    expect(screen.getAllByText(/took its default/u)).toHaveLength(1);
    expect(within(screen.getByRole('list', { name: '2 warnings' })).getAllByRole('listitem').map((warning) => warning.textContent)).toEqual([
      'the Baton pass to code code-2 failed at prepared: the successor exited',
      'no Assistant can come up: open incidents take their defaults',
    ]);
    const unreachable = screen.getByText('Overseer unreachable.');
    const line = incidentLine();
    expect(line).not.toBeNull();
    expect(unreachable.compareDocumentPosition(line as Node) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect((line as Node).compareDocumentPosition(document.querySelector('.bridge-header') as Node) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  test('Mark defaults seen moves the focus to the panel, not to the body, since its button goes with the line', async () => {
    const bridge = fakeBridge();
    await renderedLive(bridge, boardWithDefaults(INCIDENT_BOARD));
    fireEvent.click(screen.getByRole('button', { name: 'Show incidents' }));
    const markButton = screen.getByRole('button', { name: 'Mark defaults seen' });
    markButton.focus();
    fireEvent.click(markButton);
    expect(incidentLine()).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole('main'));
  });

  test('Mark defaults seen stores the noticed ids for this board in this browser and hides the line until a new default', async () => {
    const bridge = fakeBridge();
    await renderedLive(bridge, boardWithDefaults(INCIDENT_BOARD));
    fireEvent.click(screen.getByRole('button', { name: 'Show incidents' }));
    fireEvent.click(screen.getByRole('button', { name: 'Mark defaults seen' }));
    expect(JSON.parse(bridge.storage.get(SEEN_KEY) ?? '[]')).toEqual(['I1', 'I2', 'I3', 'I4']);
    expect(incidentLine()).toBeNull();
    const withNewDefault = {
      ...INCIDENT_BOARD,
      notices: [...INCIDENT_BOARD.notices ?? [], {
        kind: 'incident-defaulted', incidentId: 'I7', move: 'job-fresh', cause: 'turn-closed'
      }]
    };
    await act(async () => {
      bridge.stream().onEvent('board', boardWithDefaults(withNewDefault));
      await Promise.resolve();
    });
    expect(incidentLine()?.textContent).toContain('5 incident defaults, 2 open incidents.');
  });

  test('a seen list stored in this browser keeps the line hidden after a reload', async () => {
    const bridge = fakeBridge();
    bridge.storage.set(SEEN_KEY, JSON.stringify(['I1', 'I2', 'I3', 'I4']));
    await renderedLive(bridge, boardWithDefaults(INCIDENT_BOARD));
    expect(incidentLine()).toBeNull();
  });
});

describe('new code behind the same port', () => {
  test('a reconnect to an Overseer reporting another code version reloads the page, and one reporting the same does not', async () => {
    const bridge = fakeBridge();
    await renderedLive(bridge);
    await act(async () => {
      bridge.stream().onConnection('down');
      bridge.stream().onConnection('live');
      await Promise.resolve();
    });
    expect(bridge.reloads()).toBe(0);
    bridge.identityNext({ ...IDENTITY, codeVersion: 'code-2' });
    await act(async () => {
      bridge.stream().onConnection('down');
      bridge.stream().onConnection('live');
      await Promise.resolve();
    });
    expect(bridge.reloads()).toBe(1);
  });

  test('an identity fetch that gave up at load is asked again on the next connection, which turns the reload on new code back on', async () => {
    const bridge = fakeBridge();
    bridge.identityNext(null);
    await renderedLive(bridge);
    bridge.identityNext(IDENTITY);
    await act(async () => {
      bridge.stream().onConnection('down');
      bridge.stream().onConnection('live');
      await Promise.resolve();
    });
    bridge.identityNext({ ...IDENTITY, codeVersion: 'code-2' });
    await act(async () => {
      bridge.stream().onConnection('down');
      bridge.stream().onConnection('live');
      await Promise.resolve();
    });
    expect(bridge.reloads()).toBe(1);
  });
});

describe('the shell\'s routing', () => {
  test('a load with no fragment opens the stored tab once the identity arrives, and keeps it stored', async () => {
    const bridge = fakeBridge();
    const storedTabKey = `${PRODUCT_NAMES.STORAGE_PREFIX}:${IDENTITY.trackerId}:tab`;
    bridge.storage.set(storedTabKey, 'questions');
    await renderedLive(bridge);
    await act(async () => {
      await Promise.resolve();
    });
    expect(document.querySelector('.bridge-panel')?.getAttribute('data-tab')).toBe('questions');
    expect(bridge.storage.get(storedTabKey)).toBe('questions');
  });

  test('the questions and assistant tabs show their views, not the board counts', async () => {
    window.location.hash = '#questions';
    await renderedLive(fakeBridge());
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByRole('heading', { name: 'Open questions' })).not.toBeNull();
    await act(async () => {
      window.location.hash = '#assistant';
      window.dispatchEvent(new HashChangeEvent('hashchange'));
      await Promise.resolve();
    });
    expect(screen.getByRole('heading', { name: 'Open incidents' })).not.toBeNull();
    expect(screen.queryByText('Waiting for the Overseer\'s first board.')).toBeNull();
  });

  test('the tickets tab shows the Tickets view, with the row form once a ticket line is selected, which its opener or × closes', async () => {
    window.location.hash = '#tickets/ticket-row/002';
    await renderedLive(fakeBridge(), { ...BOARD, ...exampleDetailBoard({ tickets: [exampleDetailTicket('002')], withoutEpics: true }) });
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByRole('complementary', { name: 'Row #002' })).toBeDefined();
    expect(screen.getByRole('link', { name: '#002' }).getAttribute('href')).toBe('#tickets');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Close' }));
      window.dispatchEvent(new HashChangeEvent('hashchange'));
      await Promise.resolve();
    });
    expect(window.location.hash).toBe('#tickets');
    expect(screen.queryByRole('complementary', { name: 'Row #002' })).toBeNull();
  });

  test('the detail panel opens in place over the Kanban too, holding the page\'s one Flint slot, and Esc closes it', async () => {
    window.location.hash = '#kanban/ticket/002';
    await renderedLive(fakeBridge(), { ...BOARD, ...exampleDetailBoard({ tickets: [exampleDetailTicket('002')], withoutEpics: true }) });
    expect(screen.getByRole('complementary', { name: 'Ticket #002' })).toBeDefined();
    expect(document.querySelectorAll('.design-system-flint-slot')).toHaveLength(1);
    expect(document.querySelector('.bridge-activity .design-system-flint-slot')).toBeNull();
    await act(async () => {
      fireEvent.keyDown(document, { key: 'Escape' });
      window.dispatchEvent(new HashChangeEvent('hashchange'));
      await Promise.resolve();
    });
    expect(window.location.hash).toBe('#kanban');
    expect(screen.queryByRole('complementary', { name: 'Ticket #002' })).toBeNull();
  });

  test('Esc hands the focus back to the opener that held it as the panel opened', async () => {
    window.location.hash = '#tickets';
    await renderedLive(fakeBridge(), { ...BOARD, ...exampleDetailBoard({ tickets: [exampleDetailTicket('002')], withoutEpics: true }) });
    const opener = screen.getByRole('link', { name: '#002' });
    await act(async () => {
      opener.focus();
      window.location.hash = '#tickets/ticket-row/002';
      window.dispatchEvent(new HashChangeEvent('hashchange'));
      await Promise.resolve();
    });
    expect(screen.getByRole('complementary', { name: 'Row #002' })).toBeDefined();
    act(() => screen.getByRole('button', { name: 'Close' }).focus());
    await act(async () => {
      fireEvent.keyDown(document, { key: 'Escape' });
      window.dispatchEvent(new HashChangeEvent('hashchange'));
      await Promise.resolve();
    });
    expect(screen.queryByRole('complementary', { name: 'Row #002' })).toBeNull();
    expect(document.activeElement?.textContent).toBe('#002');
  });

  test('Waves and Epics are absent on a board without dependencies or epics, and a route to them falls back to the Kanban', async () => {
    window.location.hash = '#waves';
    const board = { ...BOARD, ...exampleTicketsBoard({ tickets: [exampleTicketsTicket('002')], withoutEpics: true }) };
    await renderedLive(fakeBridge(), board);
    const tabs = [...document.querySelectorAll('.design-system-tab')].map((tab) => tab.textContent);
    expect(tabs).toEqual(['Kanban', 'Progress', 'Tickets', 'Agents', 'Questions', 'Assistant', 'Intake']);
    expect(document.querySelector('.bridge-panel')?.getAttribute('data-tab')).toBe('kanban');
  });

  test('a board with no readable pipeline routes to the Pipeline tab even from a stored Kanban, with the header in setup', async () => {
    const bridge = fakeBridge();
    const storedTabKey = `${PRODUCT_NAMES.STORAGE_PREFIX}:${IDENTITY.trackerId}:tab`;
    bridge.storage.set(storedTabKey, 'kanban');
    await renderedLive(bridge, { ...BOARD, pipeline: pipelineBoardStateOf('A0').pipeline, pipelineSetup: null });
    await act(async () => {
      await Promise.resolve();
    });
    expect(document.querySelector('.bridge-panel')?.getAttribute('data-tab')).toBe('pipeline');
    expect(screen.getByRole('region', { name: 'Set up the pipeline' })).toBeDefined();
    expect(screen.getByRole('list', { name: 'Setup steps' })).toBeDefined();
    expect(document.querySelector('.design-system-tabs')).toBeNull();
  });

  test('a board with a readable pipeline shows the Pipeline tab last, and #pipeline opens the view', async () => {
    window.location.hash = '#pipeline';
    await renderedLive(fakeBridge(), { ...BOARD, pipeline: pipelineBoardStateOf('A5').pipeline, pipelineSetup: null });
    const tabs = [...document.querySelectorAll('.design-system-tab')].map((tab) => tab.textContent);
    expect(tabs.at(-1)).toBe('Pipeline');
    expect(document.querySelector('.bridge-panel')?.getAttribute('data-tab')).toBe('pipeline');
    expect(screen.getByRole('region', { name: 'Pipeline' })).toBeDefined();
    expect(screen.queryByRole('list', { name: 'Setup steps' })).toBeNull();
  });

  test('a route naming a ticket section opens the panel on that section', async () => {
    window.location.hash = '#kanban/ticket/002/timeline';
    await renderedLive(fakeBridge(), { ...BOARD, ...exampleDetailBoard({ tickets: [exampleDetailTicket('002')], withoutEpics: true }) });
    expect(screen.getByRole('complementary', { name: 'Ticket #002' })).toBeDefined();
    expect(screen.getByRole('link', { name: 'Timeline' }).getAttribute('aria-current')).toBe('page');
    expect(screen.getByRole('list', { name: 'Time spent in each state' })).toBeDefined();
  });

  test('an Intake route selects that session and opens no detail panel', async () => {
    window.location.hash = '#intake/J7';
    const intakeJob = {
      id: 'J7', kind: 'product-owner', ticketIds: [], state: 'running', intake: { text: 'Saved baskets' }
    };
    await renderedLive(fakeBridge(), { ...BOARD, jobs: [intakeJob], questionHistory: [] });
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByRole('region', { name: 'Intake J7' })).toBeDefined();
    expect(screen.getByRole('link', { name: 'Intake J7' }).getAttribute('aria-current')).toBe('true');
    expect(document.querySelector('.design-system-side-panel')).toBeNull();
  });
});

describe('the question panel', () => {
  const panelBoard = (decisions: readonly unknown[] = [{ ...DARK_MODE_QUESTION, ticketIds: ['002'] }]): unknown => ({
    ...BOARD,
    ...exampleDetailBoard({ tickets: [exampleDetailTicket('002')], withoutEpics: true }),
    decisions,
    questionHistory: [],
  });

  const questionPanel = (): HTMLElement | null => screen.queryByRole('complementary', { name: 'Question E7 from J4' });

  async function routeTo(fragment: string): Promise<void> {
    await act(async () => {
      window.location.hash = fragment;
      window.dispatchEvent(new HashChangeEvent('hashchange'));
      await Promise.resolve();
    });
  }

  async function renderedWithIdentity(bridge: FakeBridge): Promise<void> {
    await renderedLive(bridge, panelBoard());
    await act(async () => {
      await Promise.resolve();
    });
  }

  test('an open agent question shows the panel over the Kanban, Agents and Questions tabs alike', async () => {
    await renderedWithIdentity(fakeBridge());
    expect(questionPanel()).not.toBeNull();
    await routeTo('#agents');
    expect(questionPanel()).not.toBeNull();
    await routeTo('#questions');
    expect(questionPanel()).not.toBeNull();
  });

  test('a routed detail hides the panel until it closes, and Esc closes the detail first, then the panel', async () => {
    await renderedWithIdentity(fakeBridge());
    await routeTo('#kanban/ticket/002');
    expect(screen.getByRole('complementary', { name: 'Ticket #002' })).toBeDefined();
    expect(questionPanel()).toBeNull();
    expect(document.querySelector('.bridge-question-panel[hidden]')).not.toBeNull();
    await act(async () => {
      fireEvent.keyDown(document, { key: 'Escape' });
      window.dispatchEvent(new HashChangeEvent('hashchange'));
      await Promise.resolve();
    });
    expect(window.location.hash).toBe('#kanban');
    expect(questionPanel()).not.toBeNull();
    act(() => {
      fireEvent.keyDown(document, { key: 'Escape' });
    });
    expect(questionPanel()).toBeNull();
  });

  test('the no-pipeline question never covers the setup by itself, and covers a board that has a pipeline like any question', async () => {
    const checksNotSet = {
      ...DARK_MODE_QUESTION, id: 'E1', kind: 'checks-not-set', ticketIds: [], jobId: null, askedBy: 'overseer'
    };
    const checksNotSetPanel = (): HTMLElement | null => screen.queryByRole('complementary', { name: 'Question E1 from Overseer' });
    const bridge = fakeBridge();
    await renderedLive(bridge, {
      ...BOARD, pipeline: pipelineBoardStateOf('A0').pipeline, pipelineSetup: null, decisions: [checksNotSet], questionHistory: []
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByRole('region', { name: 'Set up the pipeline' })).toBeDefined();
    expect(checksNotSetPanel()).toBeNull();

    await act(async () => {
      bridge.stream().onEvent('board', {
        ...BOARD, pipeline: pipelineBoardStateOf('A5').pipeline, pipelineSetup: null, decisions: [checksNotSet], questionHistory: []
      });
      await Promise.resolve();
    });
    expect(checksNotSetPanel()).not.toBeNull();
  });

  test('Fold to the tab hides the panel, the Questions tab keeps its count, and the fold is stored for this board', async () => {
    const bridge = fakeBridge();
    await renderedWithIdentity(bridge);
    act(() => {
      fireEvent.click(within(questionPanel() as HTMLElement).getByRole('button', { name: 'Fold to the tab' }));
    });
    expect(questionPanel()).toBeNull();
    expect(screen.getByRole('link', { name: /^Questions, 1 question waits on User/u }).querySelector('.design-system-count-badge')?.textContent).toBe('1');
    expect(bridge.storage.get(`${PRODUCT_NAMES.STORAGE_PREFIX}:${IDENTITY.trackerId}:question-panel`)).toBe('["E7"]');
  });

  const flintSlots = (): Element[] => [...document.querySelectorAll('.design-system-flint-slot')];

  /** The page shows one Flint: the live sprite, and a slot is only a place it visits, drawing nothing of its own. */
  function expectOneFlint(): void {
    expect(document.querySelectorAll(`svg[${FLINT_OVERLAY_ATTRIBUTE}]`)).toHaveLength(1);
    expect(flintSlots().filter((slot) => slot.childElementCount > 0)).toEqual([]);
  }

  test('over the Assistant the panel holds the page\'s one Flint slot, and a fold gives the chat head its own back', async () => {
    window.location.hash = '#assistant';
    await renderedWithIdentity(fakeBridge());
    expect(questionPanel()).not.toBeNull();
    expect(flintSlots()).toHaveLength(1);
    expect(flintSlots()[0]?.closest('.bridge-question-panel')).not.toBeNull();
    act(() => {
      fireEvent.click(within(questionPanel() as HTMLElement).getByRole('button', { name: 'Fold to the tab' }));
    });
    expect(flintSlots()).toHaveLength(1);
    expect(flintSlots()[0]?.closest('.bridge-assistant-chat-head')).not.toBeNull();
    expectOneFlint();
  });

  test('on a routed ticket of the Kanban the detail\'s state card holds the page\'s one Flint slot, and the question panel holds it once the detail closes', async () => {
    window.location.hash = '#kanban/ticket/002';
    await renderedWithIdentity(fakeBridge());
    expect(flintSlots()).toHaveLength(1);
    expect(flintSlots()[0]?.closest('.bridge-detail-state-card')).not.toBeNull();
    await routeTo('#kanban');
    expect(flintSlots()).toHaveLength(1);
    expect(flintSlots()[0]?.closest('.bridge-question-panel')).not.toBeNull();
    expectOneFlint();
  });

  test('a decision that arrives while a ticket detail is open puts no slot behind the detail, whose state card keeps the page\'s one', async () => {
    window.location.hash = '#kanban/ticket/002';
    const bridge = fakeBridge();
    await renderedLive(bridge, panelBoard([]));
    await act(async () => {
      bridge.stream().onEvent('board', panelBoard());
      await Promise.resolve();
    });
    expect(document.querySelector('.bridge-question-panel[hidden]')).not.toBeNull();
    expect(flintSlots()).toHaveLength(1);
    expect(flintSlots()[0]?.closest('.bridge-detail-state-card')).not.toBeNull();
    expectOneFlint();
  });
});

describe('the embed channel in a frame', () => {
  const PARENT_ORIGIN = 'http://127.0.0.1:5180';

  interface PostedMessage {
    readonly message:      unknown;
    readonly targetOrigin: string;
  }

  function framedBridge(): { bridge: FakeBridge; posted: PostedMessage[]; parent: Window } {
    const bridge = fakeBridge();
    const posted: PostedMessage[] = [];
    const parent = { postMessage: (message: unknown, targetOrigin: string) => posted.push({ message, targetOrigin }) } as unknown as Window;
    return {
      bridge: { ...bridge, services: { ...bridge.services, embedMode: 'frame', embeddedSurroundings: () => ({ window, parent, parentOrigin: PARENT_ORIGIN }) } },
      posted,
      parent,
    };
  }

  function envelope(message: object): PostedMessage {
    return {
      message: {
        channel: 'forge-embed', channelVersion: 1, systemVersion: FORGE_SYSTEM_VERSIONS.current, ...message
      },
      targetOrigin: PARENT_ORIGIN
    };
  }

  async function parentSends(parent: Window, data: unknown): Promise<void> {
    await act(async () => {
      window.dispatchEvent(new MessageEvent('message', { data, origin: PARENT_ORIGIN, source: parent }));
      window.dispatchEvent(new HashChangeEvent('hashchange'));
      await Promise.resolve();
    });
  }

  /** The identity arrives after the first board; it is awaited too, so no state update lands outside `act`. */
  async function renderedInFrame(bridge: FakeBridge, board: unknown = BOARD): Promise<void> {
    await renderedLive(bridge, board);
    await act(async () => {
      await Promise.resolve();
    });
  }

  const twoQuestionBoard = (): unknown => ({
    ...BOARD,
    ...exampleDetailBoard({ tickets: [exampleDetailTicket('002')], withoutEpics: true }),
    decisions:       [{ ...DARK_MODE_QUESTION, ticketIds: ['002'] }, { ...DARK_MODE_QUESTION, id: 'E8', ticketIds: ['002'] }],
    questionHistory: [],
  });

  test('the framed Kanban keeps its Agents-at-work strip, holding the page\'s one Flint slot, and hides the title row', async () => {
    window.location.hash = '#kanban';
    const pageStyle = document.createElement('style');
    pageStyle.textContent = pageStylesheets().map((stylesheet) => stylesheet.text).join('\n');
    document.head.append(pageStyle);
    document.documentElement.setAttribute('data-embedded', 'frame');
    try {
      const { bridge } = framedBridge();
      await renderedInFrame(bridge);
      const activityStrip = document.querySelector<HTMLElement>('.bridge-activity');
      const titleRow = document.querySelector<HTMLElement>('.bridge-head-title-row');
      expect(activityStrip).not.toBeNull();
      expect(titleRow).not.toBeNull();
      expect(window.getComputedStyle(activityStrip as HTMLElement).display).not.toBe('none');
      expect(window.getComputedStyle(titleRow as HTMLElement).display).toBe('none');
      expect(document.querySelectorAll('.design-system-flint-slot')).toHaveLength(1);
      expect(activityStrip?.querySelector('.design-system-flint-slot')).not.toBeNull();
    } finally {
      document.documentElement.removeAttribute('data-embedded');
      pageStyle.remove();
    }
  });

  test('ready goes out once when the shell has painted, then the shown route, both to the parent\'s origin only', async () => {
    window.location.hash = '#agents';
    const { bridge, posted } = framedBridge();
    await renderedInFrame(bridge);
    expect(posted).toEqual([envelope({ kind: 'ready' }), envelope({ kind: 'route', fragment: '#agents' })]);
  });

  test('navigate to #questions/E8 points the question panel at E8 and is answered with route', async () => {
    window.location.hash = '#kanban';
    const { bridge, posted, parent } = framedBridge();
    await renderedInFrame(bridge, twoQuestionBoard());
    posted.length = 0;
    await parentSends(parent, {
      channel: 'forge-embed', channelVersion: 1, kind: 'navigate', fragment: '#questions/E8'
    });
    expect(screen.queryByRole('complementary', { name: 'Question E8 from J4' })).not.toBeNull();
    expect(posted).toEqual([envelope({ kind: 'route', fragment: '#questions/E8' })]);
  });

  test('navigate to the route already shown is answered with route at once', async () => {
    window.location.hash = '#agents';
    const { bridge, posted, parent } = framedBridge();
    await renderedInFrame(bridge);
    posted.length = 0;
    await parentSends(parent, {
      channel: 'forge-embed', channelVersion: 1, kind: 'navigate', fragment: '#agents'
    });
    expect(posted).toEqual([envelope({ kind: 'route', fragment: '#agents' })]);
  });

  test('navigate that moves the address bar but leaves the route shown is answered with the route shown', async () => {
    window.location.hash = '#agents';
    const { bridge, posted, parent } = framedBridge();
    await renderedInFrame(bridge);
    posted.length = 0;
    await parentSends(parent, {
      channel: 'forge-embed', channelVersion: 1, kind: 'navigate', fragment: '#agents/'
    });
    expect(window.location.hash).toBe('#agents/');
    expect(posted).toEqual([envelope({ kind: 'route', fragment: '#agents' })]);
  });

  test('a message of another channel version, another channel or no envelope is ignored and answered by nothing', async () => {
    window.location.hash = '#agents';
    const { bridge, posted, parent } = framedBridge();
    await renderedInFrame(bridge);
    posted.length = 0;
    await parentSends(parent, {
      channel: 'forge-embed', channelVersion: 2, kind: 'navigate', fragment: '#questions'
    });
    await parentSends(parent, {
      channel: 'other-embed', channelVersion: 1, kind: 'navigate', fragment: '#questions'
    });
    await parentSends(parent, { kind: 'theme', themeChoice: 'dark' });
    expect(window.location.hash).toBe('#agents');
    expect(posted).toEqual([]);
  });

  test('Esc that no panel takes posts leave, and a lost session posts session-lost', async () => {
    window.location.hash = '#agents';
    const { bridge, posted } = framedBridge();
    await renderedInFrame(bridge);
    posted.length = 0;
    act(() => {
      fireEvent.keyDown(document, { key: 'Escape' });
    });
    act(() => bridge.stream().onConnection('no-session'));
    expect(posted).toEqual([envelope({ kind: 'leave' }), envelope({ kind: 'session-lost' })]);
  });

  test('an item route of a tab with no panel, a session, New chat or a question, leaves the board on Esc', async () => {
    for (const fragment of ['#intake/J5', '#intake/new', '#questions/E3']) {
      window.location.hash = fragment;
      const { bridge, posted } = framedBridge();
      await renderedInFrame(bridge);
      posted.length = 0;
      act(() => {
        fireEvent.keyDown(document, { key: 'Escape' });
      });
      expect([fragment, posted]).toEqual([fragment, [envelope({ kind: 'leave' })]]);
      cleanup();
    }
  });

  test('an open detail panel takes the Esc, and the board is not left', async () => {
    window.location.hash = '#kanban/ticket/002';
    const { bridge, posted } = framedBridge();
    await renderedInFrame(bridge, BOARD_WITH_TICKET_002());
    posted.length = 0;
    act(() => {
      fireEvent.keyDown(document, { key: 'Escape' });
    });
    expect(posted).toEqual([]);
  });

  const BOARD_WITH_TICKET_002 = (): unknown => ({ ...BOARD, ...exampleDetailBoard({ tickets: [exampleDetailTicket('002')], withoutEpics: true }) });

  async function recordDeliveredByHand(): Promise<void> {
    for (const name of ['Delivered by hand…', 'Record delivered']) {
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name }));
        await Promise.resolve();
      });
    }
  }

  test('a by-hand delivery the Overseer refuses shows its sentence verbatim in the frame, and posts nothing to the parent', async () => {
    window.location.hash = '#kanban/ticket/002';
    const { bridge, posted } = framedBridge();
    await renderedInFrame(bridge, BOARD_WITH_TICKET_002());
    posted.length = 0;
    const refusal = 'Ticket #002 has job J4 live (running), so it cannot be recorded delivered by hand. Nothing was written.';
    bridge.answerWith({ verdict: 'refused', refusal });
    await recordDeliveredByHand();
    expect(screen.getByText(refusal).getAttribute('role')).toBe('status');
    expect(posted).toEqual([]);
  });

  test('a by-hand delivery whose session token answers 401 posts session-lost to the parent', async () => {
    window.location.hash = '#kanban/ticket/002';
    const { bridge, posted } = framedBridge();
    await renderedInFrame(bridge, BOARD_WITH_TICKET_002());
    posted.length = 0;
    bridge.answerWith({ verdict: 'no-session' });
    await recordDeliveredByHand();
    expect(posted).toEqual([envelope({ kind: 'session-lost' })]);
  });
});

describe('Flint\'s brain', () => {
  test('a board whose brain runs gives Flint its director for the time left, and a board where it ended takes it back', async () => {
    const bridge = fakeBridge();
    const brainCalls: (number | 'stopped')[] = [];
    const recordingFlint = (handle: FlintHandle | null): void => {
      if (handle === null) return;
      const { startBrain, stopBrain } = handle;
      Object.assign(handle, {
        startBrain: (director: Parameters<FlintHandle['startBrain']>[0], maximumMilliseconds: number) => {
          brainCalls.push(maximumMilliseconds);
          startBrain(director, maximumMilliseconds);
        },
        stopBrain: () => {
          brainCalls.push('stopped');
          stopBrain();
        },
      });
    };
    const services = { ...bridge.services, onFlintHandle: recordingFlint, flintBrainClient: { ask: () => Promise.resolve({ verdict: 'unreachable' as const }) } };
    render(<BridgeApp services={services} />);
    await act(async () => {
      bridge.stream().onConnection('live');
      bridge.stream().onEvent('board', { ...BOARD, flintBrain: { reading: runningFlintBrain('2026-10-29T19:59:30Z', '2026-10-29T20:01:30Z'), runs: [] } });
      await Promise.resolve();
    });
    // Flint is made again once the board's identity gives it its storage, and the running brain goes to the new Flint.
    expect([brainCalls.at(-1), brainCalls.filter((call) => call !== 90_000 && call !== 'stopped')]).toEqual([90_000, []]);
    const callsWhileRunning = brainCalls.length;
    await act(async () => {
      bridge.stream().onEvent('board', { ...BOARD, flintBrain: { reading: exampleFlintBrain({ state: 'ended', endedReason: 'time' }), runs: [] } });
      await Promise.resolve();
    });
    expect(brainCalls.slice(callsWhileRunning)).toEqual(['stopped']);
  });

  test('the brain\'s controls are hidden: a double click on Forge\'s mark sends nothing, and the Agents tab shows no brain card', async () => {
    const bridge = fakeBridge();
    window.location.hash = '#agents';
    await renderedLive(bridge, { ...BOARD, flintBrain: { reading: OFF_FLINT_BRAIN, runs: [] } });
    expect(screen.getByRole('img', { name: 'Forge' }).querySelector('title')).toBeNull();
    await act(async () => {
      fireEvent.doubleClick(screen.getByRole('img', { name: 'Forge' }));
      await Promise.resolve();
    });
    expect(bridge.sent).toEqual([]);
    await act(async () => {
      bridge.stream().onEvent('board', { ...BOARD, flintBrain: { reading: exampleFlintBrain({ state: 'starting', startedBy: 'bridge' }), runs: [] } });
      await Promise.resolve();
    });
    expect(screen.queryByRole('region', { name: 'Flint\'s brain' })).toBeNull();
    window.location.hash = '';
  });
});

describe('the error boundary', () => {
  test('a view that throws while rendering leaves the error banner in its place', () => {
    const Failing = (): never => {
      throw new Error('the planted view broke');
    };
    const originalConsoleError = console.error;
    console.error = () => undefined;
    try {
      render(<BridgeErrorBoundary><Failing /></BridgeErrorBoundary>);
    } finally {
      console.error = originalConsoleError;
    }
    expect(screen.getByRole('alert').textContent).toStartWith('The Bridge failed to render: the planted view broke.');
  });
});
