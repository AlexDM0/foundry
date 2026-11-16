/**
 * Flint's brain over the server's request handler and this command route, on requests built in memory: no server listens. What matters:
 * `POST /api/v1/commands` takes both brain kinds as `/api/commands` does, answering the brain's verdict and each refusal 409 with its code
 * and sentence; the caller it hands the command route carries a Bridge session only when the request's cookie names a session this server
 * holds, never for the token alone or a forged cookie; and the Bridge's `POST /api/flint-brain/ask` answers only a reader's session or
 * token, refuses a body past its size limit or of no JSON before the brain sees it, and is served at no versioned path.
 */
import {
  afterEach,
  describe,
  expect,
  test
} from 'bun:test';

import type { MonitorFlintBrainStartedBy } from 'forge-contracts/MonitorSnapshotDocument';

import type { FlintBrainRefusal } from '../../../src/services/overseer/@types/FlintBrainRun.ts';
import type { FlintBrainVerdict } from '../../../src/services/overseer/FlintBrain.ts';
import {
  type CommandCaller,
  OverseerServer,
  type OverseerRequestHandler,
  type OverseerRoutes
} from '../../../src/services/overseer/OverseerServer.ts';
import { FlintBrainWordingUtil }                                               from '../../../src/services/overseer/utils/FlintBrainWordingUtil.ts';
import { FLINT_BRAIN_DIGEST_SIZE_LIMIT_BYTES }                                 from '../../../src/shared/constants/OverseerLimits.ts';
import { COMMAND_ROUTE_KINDS, answerControlCommand, type CommandRouteRequest } from './CommandRoute.ts';

const PORT = 4100;
const ORIGIN = `http://127.0.0.1:${PORT}`;
const TOKEN = 'example-token';
const HOST_HEADERS = { host: `127.0.0.1:${PORT}` };
const TOKEN_HEADERS = { ...HOST_HEADERS, authorization: `Bearer ${TOKEN}` };

const openHandlers: OverseerRequestHandler[] = [];

afterEach(() => {
  for (const handler of openHandlers.splice(0)) handler.closeEveryStream();
});

interface Harness {
  readonly handler:        OverseerRequestHandler;
  readonly callers:        CommandCaller[];
  readonly starters:       MonitorFlintBrainStartedBy[];
  readonly asks:           unknown[];
  readonly refuseNextWith: (refusal: FlintBrainRefusal) => void;
}

/** The server's handler over the real command route, whose brain answers each command `done` unless a case scripts a refusal. */
function harness(): Harness {
  const callers: CommandCaller[] = [];
  const starters: MonitorFlintBrainStartedBy[] = [];
  const asks: unknown[] = [];
  let nextVerdict: FlintBrainVerdict = { verdict: 'done' };
  const answer = async (): Promise<FlintBrainVerdict> => {
    const verdict = nextVerdict;
    nextVerdict = { verdict: 'done' };
    return await Promise.resolve(verdict);
  };
  const commandRequest = {
    flintBrain: {
      start: async (startedBy: MonitorFlintBrainStartedBy) => {
        starters.push(startedBy);
        return await answer();
      },
      stop: answer,
    },
  } as Partial<CommandRouteRequest> as CommandRouteRequest;
  const routes = {
    token:   () => TOKEN,
    started: () => true,
    command: async (body, caller) => {
      callers.push(caller);
      return await answerControlCommand(body, commandRequest, caller);
    },
    askFlintBrain: async (body) => {
      asks.push(body);
      return await Promise.resolve({ status: 200, body: { kind: 'not-asked', reason: 'not-running' } });
    },
    refusalTextOf: (refusal) => `Example sentence for ${refusal}`,
    frameOrigins:  () => [],
  } as Partial<OverseerRoutes> as OverseerRoutes;
  const handler = OverseerServer.requestHandlerOf({
    portChoice: { kind: 'given', port: PORT },
    identity:   {
      trackerId: 'tracker-example', project: 'Example Agency', codeVersion: 'code-example', installVersion: 17, processId: 4242
    },
    routes,
    now: () => new Date('2026-11-16T12:00:00Z'),
  });
  openHandlers.push(handler);
  return {
    handler,
    callers,
    starters,
    asks,
    refuseNextWith: (refusal) => {
      nextVerdict = { verdict: 'refused', refusal, sentence: FlintBrainWordingUtil.refusalSentenceOf(refusal) };
    },
  };
}

function post(path: string, headers: Record<string, string>, body: string): Request {
  return new Request(`${ORIGIN}${path}`, { method: 'POST', headers, body });
}

/** A Bridge session as the Bridge gets one: a one-time code bought with the token, exchanged for the cookie it sends from then on. */
async function sessionCookieOf(handler: OverseerRequestHandler): Promise<string> {
  const issued = await handler.answer(post('/api/session-codes', TOKEN_HEADERS, ''), PORT);
  const { code } = await issued.json() as { code: string };
  const exchanged = await handler.answer(post('/api/session', HOST_HEADERS, JSON.stringify({ code })), PORT);
  return (exchanged.headers.get('set-cookie') ?? '').split(';')[0] ?? '';
}

async function answerFactsOf(response: Response): Promise<[number, unknown]> {
  return [response.status, await response.json()];
}

describe('Flint\'s brain\'s commands at /api/v1/commands', () => {
  test('both kinds are taken by the command route and answered done, at the versioned path as at the unversioned one', async () => {
    const { handler } = harness();
    expect(COMMAND_ROUTE_KINDS).toEqual(expect.arrayContaining(['flint-brain-start', 'flint-brain-stop']));
    for (const path of ['/api/v1/commands', '/api/commands']) {
      for (const kind of ['flint-brain-start', 'flint-brain-stop']) {
        const answered = await handler.answer(post(path, TOKEN_HEADERS, JSON.stringify({ kind })), PORT);
        expect(await answerFactsOf(answered), `${kind} at ${path}`).toEqual([200, { controlVersion: 1, outcome: 'done', result: { kind } }]);
      }
    }
  });

  test('each refusal of the brain answers 409 with its code and sentence', async () => {
    const refusals: readonly { kind: string; refusal: FlintBrainRefusal }[] = [
      { kind: 'flint-brain-start', refusal: { code: 'brain-already-running' } },
      { kind: 'flint-brain-start', refusal: { code: 'overseer-paused' } },
      { kind: 'flint-brain-start', refusal: { code: 'usage-limit-holds', resetsAt: '2026-11-16T14:00:00.000Z' } },
      { kind: 'flint-brain-start', refusal: { code: 'brain-failed-to-start' } },
      { kind: 'flint-brain-start', refusal: { code: 'no-flint' } },
      { kind: 'flint-brain-stop', refusal: { code: 'brain-not-running' } },
    ];
    const { handler, refuseNextWith } = harness();
    for (const { kind, refusal } of refusals) {
      refuseNextWith(refusal);
      const answered = await handler.answer(post('/api/v1/commands', TOKEN_HEADERS, JSON.stringify({ kind })), PORT);
      const refusedBody = { controlVersion: 1, refusal: refusal.code, text: FlintBrainWordingUtil.refusalSentenceOf(refusal) };
      expect(await answerFactsOf(answered), refusal.code).toEqual([409, refusedBody]);
    }
  });

  test('a start is the API\'s by the token alone and the Bridge\'s by a session this server holds, never by a forged cookie or the body', async () => {
    const { handler, callers, starters } = harness();
    const startBody = JSON.stringify({ kind: 'flint-brain-start', startedBy: 'bridge' });
    const sessionCookie = await sessionCookieOf(handler);
    const forgedCookie = `${sessionCookie.split('=')[0] ?? ''}=not-a-session`;
    await handler.answer(post('/api/v1/commands', TOKEN_HEADERS, startBody), PORT);
    await handler.answer(post('/api/v1/commands', { ...TOKEN_HEADERS, cookie: sessionCookie }, startBody), PORT);
    await handler.answer(post('/api/v1/commands', { ...TOKEN_HEADERS, cookie: forgedCookie }, startBody), PORT);
    expect(callers.map((caller) => caller.carriesBridgeSession)).toEqual([false, true, false]);
    expect(starters).toEqual(['api', 'bridge', 'api']);
  });

  test('a session with no token starts nothing: every command needs the token', async () => {
    const { handler, starters } = harness();
    const sessionCookie = await sessionCookieOf(handler);
    const answered = await handler.answer(post('/api/v1/commands', { ...HOST_HEADERS, cookie: sessionCookie }, JSON.stringify({ kind: 'flint-brain-start' })), PORT);
    expect(answered.status).toBe(401);
    expect(starters).toEqual([]);
  });
});

describe('the Bridge\'s ask of Flint\'s brain', () => {
  const digestText = JSON.stringify({ habitatKind: 'chat', intents: ['wander'] });

  test('reaches the brain behind a Bridge session or the token, and nothing without either', async () => {
    const { handler, asks } = harness();
    const sessionCookie = await sessionCookieOf(handler);
    const bySession = await handler.answer(post('/api/flint-brain/ask', { ...HOST_HEADERS, cookie: sessionCookie }, digestText), PORT);
    const byToken = await handler.answer(post('/api/flint-brain/ask', TOKEN_HEADERS, digestText), PORT);
    const byNobody = await handler.answer(post('/api/flint-brain/ask', HOST_HEADERS, digestText), PORT);
    expect([bySession.status, byToken.status, byNobody.status]).toEqual([200, 200, 401]);
    expect(await bySession.json()).toEqual({ kind: 'not-asked', reason: 'not-running' });
    expect(asks).toEqual([JSON.parse(digestText), JSON.parse(digestText)]);
  });

  test('refuses a body past its size limit 413 and one of no JSON 400, before the brain sees either', async () => {
    const { handler, asks } = harness();
    const oversized = JSON.stringify({ excerpt: 'a'.repeat(FLINT_BRAIN_DIGEST_SIZE_LIMIT_BYTES) });
    const tooLarge = await handler.answer(post('/api/flint-brain/ask', TOKEN_HEADERS, oversized), PORT);
    const notJson = await handler.answer(post('/api/flint-brain/ask', TOKEN_HEADERS, 'not json'), PORT);
    expect([await answerFactsOf(tooLarge), notJson.status]).toEqual([[413, { refusal: 'too-large' }], 400]);
    expect(asks).toEqual([]);
  });

  test('is served at no versioned path: it is the Bridge\'s own, in no registry entry', async () => {
    const { handler, asks } = harness();
    const versioned = await handler.answer(post('/api/v1/flint-brain/ask', TOKEN_HEADERS, digestText), PORT);
    expect(versioned.status).toBe(404);
    expect(asks).toEqual([]);
  });
});
