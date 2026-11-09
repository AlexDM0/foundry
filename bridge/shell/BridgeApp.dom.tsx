/**
 * The shell against fake services, in a happy-dom document. What matters: every control is disabled while the event stream is down and
 * while launches are held for an install change, a 423 raises that banner with the Overseer's sentence, a refusal shows verbatim beside
 * its control and an unreachable Overseer is said there too, a refused session code or a lost session raises the session banner in place
 * of an empty board, a reconnect to an Overseer running new code reloads the page, each tab routes to its view, and a view that throws
 * leaves the error banner, not a blank page.
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

import { PRODUCT_NAMES }                             from '../../src/shared/constants/ProductNames.ts';
import type { BoardStateDocument, OverseerIdentity } from '../@types/BoardStateDocument.ts';
import type { CommandOutcome, ControlCommandBody }   from '../api/CommandClient.ts';
import type { EventStreamHandlers }                  from '../api/EventStreamClient.ts';
import { exampleDetailBoard, exampleDetailTicket }   from '../testing/DetailBoardFixture.ts';
import { exampleTicketsBoard, exampleTicketsTicket } from '../testing/TicketsBoardFixture.ts';
import { BridgeApp, type BridgeServices }            from './BridgeApp.tsx';
import { BridgeErrorBoundary }                       from './BridgeErrorBoundary.tsx';

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
