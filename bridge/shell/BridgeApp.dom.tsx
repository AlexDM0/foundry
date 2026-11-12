/**
 * The shell against fake services, in a happy-dom document. What matters: every control is disabled while the event stream is down and
 * while launches are held for an install change, a 423 raises that banner with the Overseer's sentence, a refusal shows verbatim beside
 * its control and an unreachable Overseer is said there too, a refused session code or a lost session raises the session banner in place
 * of an empty board, a reconnect to an Overseer running new code reloads the page, each tab routes to its view, the root says whether the
 * board is live so every live animation follows the stream, a header chip links to its job on the Agents tab and its flag opens that
 * tab, the Waiting on User pill and the tab counts read the board the stream sends, the question panel shows over every tab, hides
 * behind a routed detail and closes on Esc only after it, an embedded page's Esc leaves the board on any route no panel takes it on, and a
 * view that throws leaves the error banner, not a blank page. A board with no readable pipeline shows the Pipeline tab alone, routes there
 * even from a stored Kanban, and its header is in setup; a board with one shows Pipeline last and routes `#pipeline` to the view.
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

import { PRODUCT_NAMES }                                           from '../../src/shared/constants/ProductNames.ts';
import type { BoardStateDocument, OverseerIdentity }               from '../@types/BoardStateDocument.ts';
import type { ConversationBoardDocument }                          from '../@types/ConversationDocuments.ts';
import type { CommandOutcome, ControlCommandBody }                 from '../api/CommandClient.ts';
import type { EventStreamHandlers }                                from '../api/EventStreamClient.ts';
import { exampleAgentJob }                                         from '../testing/BoardStateFixture.ts';
import { exampleDetailBoard, exampleDetailTicket }                 from '../testing/DetailBoardFixture.ts';
import { exampleIncidentBoard }                                    from '../testing/IncidentNoticeFixture.ts';
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
  readonly identityNext: (identity: OverseerIdentity) => void;
}

function fakeBridge(): FakeBridge {
  let handlers: EventStreamHandlers | null = null;
  let reloadCount = 0;
  let nextOutcome: CommandOutcome = { verdict: 'applied', outcome: 'done', result: null };
  let identity = IDENTITY;
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
      embedded:             false,
      embeddedSurroundings: () => ({ window, parent: null, parentOrigin: null }),
      now:                  () => new Date('2026-10-29T20:00:00Z'),
      followTranscript:     () => ({ close: () => undefined }),
      questionNotifier:     {
        allowance:         () => 'denied',
        askAllowance:      () => Promise.resolve('denied'),
        notify:            () => undefined,
        setDocumentTitle:  () => undefined,
        baseDocumentTitle: 'agent-progress',
      },
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
    bridge.answerWith({ verdict: 'install-held', refusal: 'The install version changed: run `forge update`.' });
    await act(async () => {
      fireEvent.click(pauseButton());
      await Promise.resolve();
    });
    expect(screen.getByRole('alert').textContent).toBe('Launches held.The install version changed: run `forge update`.');
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
    expect(screen.getByRole('link', { name: 'Questions, 1 question waits on User, 1 escalated' }).querySelector('.bridge-count-badge')?.getAttribute('data-tone')).toBe('error');
    expect(screen.getByRole('link', { name: 'Kanban, 1 waits on User' }).querySelector('.bridge-count-badge')?.textContent).toBe('1');
  });
});

describe('the session banner', () => {
  const OPEN_AGAIN = `Run \`${PRODUCT_NAMES.PROGRAM} open\` again.`;

  test('A3: a refused session code shows that another process may have used it, in place of the wait for a board', () => {
    const bridge = fakeBridge();
    render(<BridgeApp services={bridge.services} sessionExchangeOutcome="refused" />);
    const banner = screen.getByRole('alert').textContent;
    expect(banner).toContain('already used or expired');
    expect(banner).toContain('another process may have used it');
    expect(banner).toEndWith(OPEN_AGAIN);
    expect(document.querySelector('.bridge-empty')).toBeNull();
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
    expect(document.querySelector('.bridge-empty')).toBeNull();
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

  test('the detail panel opens in place over the Kanban too, and Esc closes it', async () => {
    window.location.hash = '#kanban/ticket/002';
    await renderedLive(fakeBridge(), { ...BOARD, ...exampleDetailBoard({ tickets: [exampleDetailTicket('002')], withoutEpics: true }) });
    expect(screen.getByRole('complementary', { name: 'Ticket #002' })).toBeDefined();
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
    const tabs = [...document.querySelectorAll('.bridge-tab')].map((tab) => tab.textContent);
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
    expect(document.querySelector('.bridge-tabs')).toBeNull();
  });

  test('a board with a readable pipeline shows the Pipeline tab last, and #pipeline opens the view', async () => {
    window.location.hash = '#pipeline';
    await renderedLive(fakeBridge(), { ...BOARD, pipeline: pipelineBoardStateOf('A5').pipeline, pipelineSetup: null });
    const tabs = [...document.querySelectorAll('.bridge-tab')].map((tab) => tab.textContent);
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
    expect(document.querySelector('.bridge-side-panel')).toBeNull();
  });
});

describe('the question panel', () => {
  const panelBoard = (): unknown => ({
    ...BOARD,
    ...exampleDetailBoard({ tickets: [exampleDetailTicket('002')], withoutEpics: true }),
    decisions:       [{ ...DARK_MODE_QUESTION, ticketIds: ['002'] }],
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

  test('Fold to the tab hides the panel, the Questions tab keeps its count, and the fold is stored for this board', async () => {
    const bridge = fakeBridge();
    await renderedWithIdentity(bridge);
    act(() => {
      fireEvent.click(within(questionPanel() as HTMLElement).getByRole('button', { name: 'Fold to the tab' }));
    });
    expect(questionPanel()).toBeNull();
    expect(screen.getByRole('link', { name: /^Questions, 1 question waits on User/u }).querySelector('.bridge-count-badge')?.textContent).toBe('1');
    expect(bridge.storage.get(`${PRODUCT_NAMES.STORAGE_PREFIX}:${IDENTITY.trackerId}:question-panel`)).toBe('["E7"]');
  });
});

describe('the embedded page\'s Esc', () => {
  function embeddedBridge(): { bridge: FakeBridge; leaveMessages: unknown[] } {
    const bridge = fakeBridge();
    const leaveMessages: unknown[] = [];
    const parent = { postMessage: (message: unknown) => leaveMessages.push(message) };
    return {
      bridge: { ...bridge, services: { ...bridge.services, embedded: true, embeddedSurroundings: () => ({ window, parent, parentOrigin: 'https://dashboard.example' }) } },
      leaveMessages,
    };
  }

  test('an item route of a tab with no panel, a session, New chat or a question, leaves the board on Esc', async () => {
    for (const fragment of ['#intake/J5', '#intake/new', '#questions/E3']) {
      window.location.hash = fragment;
      const { bridge, leaveMessages } = embeddedBridge();
      await renderedLive(bridge);
      act(() => {
        fireEvent.keyDown(document, { key: 'Escape' });
      });
      expect([fragment, leaveMessages]).toEqual([fragment, [{ kind: 'leave-board' }]]);
      cleanup();
    }
  });

  test('an open detail panel takes the Esc, and the board is not left', async () => {
    window.location.hash = '#kanban/ticket/002';
    const { bridge, leaveMessages } = embeddedBridge();
    await renderedLive(bridge, { ...BOARD, ...exampleDetailBoard({ tickets: [exampleDetailTicket('002')], withoutEpics: true }) });
    act(() => {
      fireEvent.keyDown(document, { key: 'Escape' });
    });
    expect(leaveMessages).toEqual([]);
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
