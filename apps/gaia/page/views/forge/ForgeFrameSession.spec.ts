/**
 * One forge's Bridge in Gaia's frame, for a tab Gaia's board does not draw yet. What matters (SCREENS B1 and its acceptance): Answer on
 * E2 lands the Bridge on `#questions/E2` and Gaia's address reads the board route `#forge/<trackerId>/questions/E2` (1); the Bridge's start
 * leaves Gaia's address as it is; Gaia adds no history entry of its own after the link that brought it there,
 * so Back returns to Attention (2); `session-lost` from a restarted Overseer brings a fresh frame back to the same route with nothing done
 * by User (3); the one-time code reaches only the frame's address, never Gaia's address or a request (4). Also: the theme is posted once
 * the Bridge is ready and on each change; `navigate` goes only when the route changes from outside; `leave` goes back; every answer of the
 * frame session reaches the state; a stale answer or a stopped session changes nothing. The server and the Bridge are stood in for by
 * answers and messages authored from PLAN 8.3 and FORGE_REQUIREMENTS F5.
 */
import { describe, expect, test } from 'bun:test';

import { GAIA_SYSTEM_VERSION } from '../../../src/shared/constants/GaiaSystemVersions.ts';
import type { BoardRoute }     from '../../board/shell/BoardRouter.ts';
import type { ThemeChoice }    from '../../shared/@types/ThemeChoice.ts';
import {
  BRIDGE_MESSAGES,
  BRIDGE_ORIGIN,
  bridgeStandIn,
  FRAME_SESSION_ANSWERS,
  frameUrlOf,
  type PostedToFrame,
  sessionCodeOf,
} from '../../testing/AuthoredBridge.ts';
import { answerResponse, type SentRequest }             from '../../testing/CommandServer.ts';
import { ForgeFrameSession }                            from './ForgeFrameSession.ts';
import { type FrameSessionResult, FrameSessionRequest } from './FrameSessionRequest.ts';

const TRACKER_ID = 'example-storefront-7c41';

const QUESTIONS_E2: BoardRoute = { tab: 'questions', item: 'E2' };

const QUESTIONS_E4: BoardRoute = { tab: 'questions', item: 'E4' };

const KANBAN: BoardRoute = { tab: 'kanban', item: null };

/** Gaia's server for frame sessions: each ask waits until the spec answers it, so no spec waits on time. */
function frameSessionServer() {
  const asks: { readonly answer: (result: FrameSessionResult) => Promise<void> }[] = [];
  return {
    asks,
    request: (trackerId: string): Promise<FrameSessionResult> => {
      expect(trackerId).toBe(TRACKER_ID);
      let resolveAsk: (result: FrameSessionResult) => void = () => undefined;
      const pending = new Promise<FrameSessionResult>((resolve) => {
        resolveAsk = resolve;
      });
      asks.push({
        answer: async (result) => {
          resolveAsk(result);
          await pending;
        },
      });
      return pending;
    },
    async answer(askIndex: number, result: FrameSessionResult): Promise<void> {
      const ask = asks[askIndex];
      if (ask === undefined) throw new Error(`The session never asked a frame session ${askIndex + 1}.`);
      await ask.answer(result);
    },
  };
}

function opened(sessionNumber: number): FrameSessionResult {
  return { verdict: 'opened', frameUrl: frameUrlOf(sessionNumber), frameOrigin: BRIDGE_ORIGIN };
}

function sessionOver(boardRoute: BoardRoute, themeChoice: ThemeChoice = 'dark') {
  const server = frameSessionServer();
  const bridge = bridgeStandIn();
  const addressWrites: string[] = [];
  let leaves = 0;
  const session = ForgeFrameSession.create(
    { trackerId: TRACKER_ID, boardRoute, themeChoice },
    {
      requestFrameSession: server.request,
      embed:               bridge.embed,
      replaceFragment:     (fragment) => addressWrites.push(fragment),
      leave:               () => {
        leaves += 1;
      },
    },
  );
  return {
    server, bridge, addressWrites, session, leaves: () => leaves,
  };
}

/** Started, answered with a session, and its frame attached, as the view does when the frame enters the page. */
async function framedSession(boardRoute: BoardRoute, themeChoice: ThemeChoice = 'dark') {
  const parts = sessionOver(boardRoute, themeChoice);
  parts.session.start();
  await parts.server.answer(0, opened(1));
  parts.session.attachFrame(parts.bridge.frameWindow);
  return parts;
}

function postedMessagesOf(bridge: ReturnType<typeof bridgeStandIn>): unknown[] {
  return bridge.posted.map((posted) => posted.message);
}

describe('opening the frame', () => {
  test('asks one frame session for the forge and shows it asking, then the frame at its address, the Bridge not yet ready', async () => {
    const { server, session } = sessionOver(QUESTIONS_E2);
    session.start();
    expect(server.asks).toHaveLength(1);
    expect(session.state()).toEqual({ phase: 'asking' });
    await server.answer(0, opened(1));
    expect(session.state()).toEqual({
      phase: 'opened', frameUrl: frameUrlOf(1), frameOrigin: BRIDGE_ORIGIN, frameLoad: 1, bridgeIsReady: false,
    });
  });

  test('on ready posts the theme, then navigate to the route\'s Bridge fragment, both to the frame\'s origin only', async () => {
    const { bridge, session } = await framedSession(QUESTIONS_E2);
    bridge.post(BRIDGE_MESSAGES.ready);
    expect(session.state()).toMatchObject({ phase: 'opened', bridgeIsReady: true });
    expect(bridge.posted).toEqual([
      {
        message: {
          channel: 'forge-embed', channelVersion: 1, systemVersion: GAIA_SYSTEM_VERSION, kind: 'theme', themeChoice: 'dark'
        },
        targetOrigin: BRIDGE_ORIGIN
      },
      {
        message: {
          channel: 'forge-embed', channelVersion: 1, systemVersion: GAIA_SYSTEM_VERSION, kind: 'navigate', fragment: '#questions/E2'
        },
        targetOrigin: BRIDGE_ORIGIN
      },
    ]);
  });

  test('a tab alone is posted as the Bridge\'s fragment of that tab, so the Bridge shows the tab Gaia\'s board shows', async () => {
    const { bridge } = await framedSession(KANBAN, 'light');
    bridge.post(BRIDGE_MESSAGES.ready);
    expect(postedMessagesOf(bridge)).toEqual([
      {
        channel: 'forge-embed', channelVersion: 1, systemVersion: GAIA_SYSTEM_VERSION, kind: 'theme', themeChoice: 'light'
      },
      {
        channel: 'forge-embed', channelVersion: 1, systemVersion: GAIA_SYSTEM_VERSION, kind: 'navigate', fragment: '#kanban'
      },
    ]);
  });

  test('a second ready of the same frame posts nothing again', async () => {
    const { bridge } = await framedSession(QUESTIONS_E2);
    bridge.post(BRIDGE_MESSAGES.ready);
    bridge.post(BRIDGE_MESSAGES.ready);
    expect(bridge.posted).toHaveLength(2);
  });
});

describe('from Answer on E2 to the Bridge\'s Questions tab (B1 acceptance 1 and 2)', () => {
  test('the Bridge answers navigate with its route, Gaia\'s address reads it in place, and no history entry or second navigate follows', async () => {
    const { bridge, addressWrites, session } = await framedSession(QUESTIONS_E2);
    bridge.post(BRIDGE_MESSAGES.ready);
    bridge.post(BRIDGE_MESSAGES.routeQuestionsE2);
    expect(addressWrites).toEqual(['#forge/example-storefront-7c41/questions/E2']);
    session.routeChanged(QUESTIONS_E2);
    expect(postedMessagesOf(bridge).filter((message) => (message as { kind: string }).kind === 'navigate')).toHaveLength(1);
  });

  test('a route the Bridge reports before it is ready is its own first route and is not written over the one Gaia asks for', async () => {
    const { bridge, addressWrites } = await framedSession(QUESTIONS_E2);
    bridge.post(BRIDGE_MESSAGES.routeKanban);
    expect(addressWrites).toEqual([]);
    bridge.post(BRIDGE_MESSAGES.ready);
    expect(postedMessagesOf(bridge)).toContainEqual({
      channel: 'forge-embed', channelVersion: 1, systemVersion: GAIA_SYSTEM_VERSION, kind: 'navigate', fragment: '#questions/E2'
    });
  });

  test('a route User takes inside the Bridge replaces Gaia\'s address with its board route, and the Bridge\'s start leaves it', async () => {
    const { bridge, addressWrites } = await framedSession(KANBAN);
    bridge.post(BRIDGE_MESSAGES.ready);
    bridge.post(BRIDGE_MESSAGES.routeKanban);
    bridge.post({ ...BRIDGE_MESSAGES.routeKanban, fragment: 'tickets/031' });
    bridge.post({ ...BRIDGE_MESSAGES.routeKanban, fragment: '' });
    expect(addressWrites).toEqual(['#forge/example-storefront-7c41/kanban', '#forge/example-storefront-7c41/tickets/031']);
  });
});

describe('the route and the theme changing from outside', () => {
  test('a new board route in Gaia\'s address is posted as navigate; the one the Bridge already shows is not', async () => {
    const { bridge, session } = await framedSession(QUESTIONS_E2);
    bridge.post(BRIDGE_MESSAGES.ready);
    bridge.post(BRIDGE_MESSAGES.routeQuestionsE2);
    session.routeChanged(QUESTIONS_E2);
    session.routeChanged(QUESTIONS_E4);
    session.routeChanged(QUESTIONS_E4);
    expect(postedMessagesOf(bridge).slice(2)).toEqual([{
      channel: 'forge-embed', channelVersion: 1, systemVersion: GAIA_SYSTEM_VERSION, kind: 'navigate', fragment: '#questions/E4'
    }]);
  });

  test('a route change before ready is kept and posted on ready', async () => {
    const { bridge, session } = await framedSession(KANBAN);
    session.routeChanged(QUESTIONS_E4);
    expect(bridge.posted).toEqual([]);
    bridge.post(BRIDGE_MESSAGES.ready);
    expect(postedMessagesOf(bridge)).toContainEqual({
      channel: 'forge-embed', channelVersion: 1, systemVersion: GAIA_SYSTEM_VERSION, kind: 'navigate', fragment: '#questions/E4'
    });
  });

  test('a theme change is posted to a ready Bridge, and one before ready reaches it on ready', async () => {
    const { bridge, session } = await framedSession(KANBAN, 'auto');
    session.themeChanged('light');
    expect(bridge.posted).toEqual([]);
    bridge.post(BRIDGE_MESSAGES.ready);
    session.themeChanged('light');
    session.themeChanged('dark');
    expect(postedMessagesOf(bridge).filter((message) => (message as { kind: string }).kind === 'theme')).toEqual([
      {
        channel: 'forge-embed', channelVersion: 1, systemVersion: GAIA_SYSTEM_VERSION, kind: 'theme', themeChoice: 'light'
      },
      {
        channel: 'forge-embed', channelVersion: 1, systemVersion: GAIA_SYSTEM_VERSION, kind: 'theme', themeChoice: 'dark'
      },
    ]);
  });
});

describe('leave', () => {
  test('goes back to the view Gaia came from', async () => {
    const { bridge, leaves } = await framedSession(QUESTIONS_E2);
    bridge.post(BRIDGE_MESSAGES.leave);
    expect(leaves()).toBe(1);
  });
});

describe('after the Overseer restarts (B1 acceptance 3)', () => {
  test('session-lost asks a new frame session, loads a fresh frame at its address and brings the Bridge back to the route', async () => {
    const { server, bridge, session } = await framedSession(QUESTIONS_E2);
    bridge.post(BRIDGE_MESSAGES.ready);
    bridge.post(BRIDGE_MESSAGES.routeQuestionsE2);
    bridge.post(BRIDGE_MESSAGES.sessionLost);
    expect(server.asks).toHaveLength(2);
    expect(session.state()).toEqual({ phase: 'asking' });
    await server.answer(1, opened(2));
    expect(session.state()).toEqual({
      phase: 'opened', frameUrl: frameUrlOf(2), frameOrigin: BRIDGE_ORIGIN, frameLoad: 2, bridgeIsReady: false,
    });
    const freshFramePosted: PostedToFrame[] = [];
    const freshFrame = { postMessage: (message: unknown, targetOrigin: string) => freshFramePosted.push({ message, targetOrigin }) };
    session.attachFrame(freshFrame);
    bridge.post(BRIDGE_MESSAGES.ready);
    expect(session.state()).toMatchObject({ bridgeIsReady: false });
    bridge.post(BRIDGE_MESSAGES.ready, { origin: BRIDGE_ORIGIN, source: freshFrame });
    expect(session.state()).toMatchObject({ bridgeIsReady: true });
    expect(freshFramePosted).toContainEqual({
      message: {
        channel: 'forge-embed', channelVersion: 1, systemVersion: GAIA_SYSTEM_VERSION, kind: 'navigate', fragment: '#questions/E2'
      },
      targetOrigin: BRIDGE_ORIGIN,
    });
  });

  test('the frame of the lost session is no longer heard', async () => {
    const { server, bridge, session } = await framedSession(KANBAN);
    bridge.post(BRIDGE_MESSAGES.ready);
    bridge.post(BRIDGE_MESSAGES.sessionLost);
    expect(bridge.listenerCount()).toBe(0);
    bridge.post(BRIDGE_MESSAGES.sessionLost);
    expect(server.asks).toHaveLength(2);
    expect(session.state()).toEqual({ phase: 'asking' });
  });

  test('a frame that loses the session it was just given, before it was ever ready, is refused rather than asked again without end', async () => {
    const { server, bridge, session } = await framedSession(QUESTIONS_E2);
    bridge.post(BRIDGE_MESSAGES.sessionLost);
    expect(server.asks).toHaveLength(1);
    expect(session.state()).toEqual({ phase: 'refused', refusal: 'session-lost-while-opening', text: null });
    expect(bridge.listenerCount()).toBe(0);
    session.askAgain();
    expect(server.asks).toHaveLength(2);
  });

});

describe('the frame session\'s answers', () => {
  test('each reaches the state: no embed channel, an Overseer gone, a refusal with the forge\'s sentence, and no server', async () => {
    const results: FrameSessionResult[] = [
      { verdict: 'not-supported' },
      { verdict: 'unreachable' },
      { verdict: 'refused', refusal: 'sessions-full', text: 'The Overseer holds as many sessions as it allows.' },
      { verdict: 'server-unreachable' },
      { verdict: 'answer-not-understood' },
    ];
    const states = await Promise.all(results.map(async (result) => {
      const { server, session } = sessionOver(KANBAN);
      session.start();
      await server.answer(0, result);
      return session.state();
    }));
    expect(states).toEqual([
      { phase: 'not-supported' },
      { phase: 'unreachable' },
      { phase: 'refused', refusal: 'sessions-full', text: 'The Overseer holds as many sessions as it allows.' },
      { phase: 'refused', refusal: 'server-unreachable', text: null },
      { phase: 'refused', refusal: 'answer-not-understood', text: null },
    ]);
  });

  test('asking again after a refusal asks once more', async () => {
    const { server, session } = sessionOver(KANBAN);
    session.start();
    await server.answer(0, { verdict: 'unreachable' });
    session.askAgain();
    await server.answer(1, opened(2));
    expect(session.state()).toMatchObject({ phase: 'opened', frameLoad: 1, frameUrl: frameUrlOf(2) });
  });

  test('an answer to an earlier ask, or one that arrives after the session stopped, changes nothing', async () => {
    const { server, session } = sessionOver(KANBAN);
    const stop = session.start();
    session.askAgain();
    await server.answer(0, opened(1));
    expect(session.state()).toEqual({ phase: 'asking' });
    stop();
    await server.answer(1, opened(2));
    expect(session.state()).toEqual({ phase: 'asking' });
    session.askAgain();
    expect(server.asks).toHaveLength(2);
  });

  test('stopping closes the frame\'s channel', async () => {
    const parts = sessionOver(KANBAN);
    const stop = parts.session.start();
    await parts.server.answer(0, opened(1));
    parts.session.attachFrame(parts.bridge.frameWindow);
    expect(parts.bridge.listenerCount()).toBe(1);
    stop();
    expect(parts.bridge.listenerCount()).toBe(0);
  });

  test('no frame is attached before a session opened', () => {
    const { bridge, session } = sessionOver(KANBAN);
    session.start();
    session.attachFrame(bridge.frameWindow)();
    expect(bridge.listenerCount()).toBe(0);
  });
});

describe('the one-time code (B1 acceptance 4)', () => {
  test('reaches only the frame\'s address: no request, no address write and no message to the frame carries it', async () => {
    const sent: SentRequest[] = [];
    const answers = [FRAME_SESSION_ANSWERS.opened(1), FRAME_SESSION_ANSWERS.opened(2)];
    const bridge = bridgeStandIn();
    const addressWrites: string[] = [];
    let pending: Promise<FrameSessionResult> = Promise.resolve({ verdict: 'unreachable' });
    const session = ForgeFrameSession.create({ trackerId: TRACKER_ID, boardRoute: QUESTIONS_E2, themeChoice: 'dark' }, {
      requestFrameSession: (trackerId) => {
        pending = FrameSessionRequest.requestFrameSession((path, requestOptions) => {
          const answer = answers[sent.length];
          sent.push({ path, requestOptions });
          if (answer === undefined) throw new Error(`The spec has no answer for request ${sent.length}.`);
          return Promise.resolve(answerResponse(answer));
        }, trackerId);
        return pending;
      },
      embed:           bridge.embed,
      replaceFragment: (fragment) => addressWrites.push(fragment),
      leave:           () => undefined,
    });
    session.start();
    await pending;
    session.attachFrame(bridge.frameWindow);
    bridge.post(BRIDGE_MESSAGES.ready);
    bridge.post({ ...BRIDGE_MESSAGES.routeKanban, fragment: `#session=${sessionCodeOf(1)}` });
    bridge.post(BRIDGE_MESSAGES.routeQuestionsE2);
    bridge.post(BRIDGE_MESSAGES.sessionLost);
    await pending;
    expect(session.state()).toMatchObject({ phase: 'opened', frameUrl: frameUrlOf(2) });
    const everythingThePageSentOrWrote = JSON.stringify({ sent, addressWrites, posted: bridge.posted });
    expect(everythingThePageSentOrWrote).not.toContain(sessionCodeOf(1));
    expect(everythingThePageSentOrWrote).not.toContain(sessionCodeOf(2));
    expect(everythingThePageSentOrWrote).not.toContain('session=');
    expect(addressWrites).toEqual(['#forge/example-storefront-7c41/questions/E2']);
  });
});
