/**
 * The page server, headless, on any free port under a scratch home: the token and the server record it writes, the whole road of the page
 * (a code bought with the token, spent for the cookie, the fleet read, a `fleet` event heard after a store change), one refused request
 * per guard, and the CSP on every answer, refusals and failures included. It refuses to start where Gaia already answers. The page's files
 * are a stand-in for the build, whose own spec builds the real page; the heartbeat's timers are fired by hand.
 */
import { readFileSync, statSync } from 'node:fs';
import { join }                   from 'node:path';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  test
} from 'bun:test';

import { serverRecordPathIn }                                           from '../../adapters/gaia-files/ServerRecordWriter.ts';
import { FleetDocumentMapUtil }                                         from '../../adapters/page-api/FleetDocumentMapUtil.ts';
import { FLEET_SNAPSHOT_EMPTY }                                         from '../../adapters/page-api/testing/fleet-snapshot-empty.ts';
import { FLEET_SNAPSHOT_FIVE_FORGES }                                   from '../../adapters/page-api/testing/fleet-snapshot-five-forges.ts';
import { eventStreamParserOf, type ServerSentEvent }                    from '../../lib/event-stream/EventStreamParser.ts';
import { LOOPBACK_ANY_PORT_FRAME_SOURCE, pageContentSecurityPolicyFor } from '../../lib/local-http-guards/ContentSecurityPolicy.ts';
import { createFleetStore, type FleetStore }                            from '../../services/FleetStore.ts';
import { manualTimers, type ManualTimers }                              from '../../testing/ManualTimers.ts';
import { createScratchDirectory, removeScratchPath }                    from '../../testing/ScratchRoot.ts';
import { startPageServer, type PageServer, type PageServerOptions }     from './PageServer.ts';
import { serverTokenPathIn }                                            from './ServerToken.ts';
import type { PageFilesSource }                                         from './routes/PageFilesRoute.ts';

const PAGE_POLICY = pageContentSecurityPolicyFor({ frameSources: [LOOPBACK_ANY_PORT_FRAME_SOURCE] });

const STARTED_AT = '2026-11-13T09:00:00.000Z';
const PROCESS_ID = 48_321;
const HEARTBEAT_MILLISECONDS = 1_000;
const SHORT_PROBE_MILLISECONDS = 500;

const OWNER_ONLY_FILE_MODE = 0o600;
const OWNER_ONLY_FOLDER_MODE = 0o700;
const PERMISSION_BITS = 0o777;

const STAND_IN_PAGE = '<!doctype html><title>Gaia</title><script type="module" src="./chunk-example.js"></script>';
const STAND_IN_CHUNK = 'document.title = "Gaia";';

const standInPageFiles: PageFilesSource = () => Promise.resolve({
  verdict: 'built',
  files:   new Map([
    ['/', new Blob([STAND_IN_PAGE], { type: 'text/html;charset=utf-8' })],
    ['/chunk-example.js', new Blob([STAND_IN_CHUNK], { type: 'text/javascript;charset=utf-8' })],
  ]),
});

let homeDirectory: string;
let fleetStore: FleetStore;
let timers: ManualTimers;
let serversToStop: PageServer[];
let streamsToAbort: AbortController[];

beforeEach(() => {
  homeDirectory  = createScratchDirectory('page-server-home');
  fleetStore     = createFleetStore(FLEET_SNAPSHOT_EMPTY);
  timers         = manualTimers();
  serversToStop  = [];
  streamsToAbort = [];
});

afterEach(async () => {
  for (const streamAbort of streamsToAbort) streamAbort.abort();
  for (const pageServer of serversToStop) await pageServer.stop();
  removeScratchPath(homeDirectory);
});

function optionsWith(overrides: Partial<PageServerOptions> = {}): PageServerOptions {
  return {
    port:                           0,
    homeDirectory,
    fleetStore,
    forgeCounts:                    () => ({ forgesRegistered: 5, forgesAnswered: 3 }),
    pageFiles:                      standInPageFiles,
    timers,
    now:                            () => STARTED_AT,
    processId:                      PROCESS_ID,
    heartbeatIntervalMilliseconds:  HEARTBEAT_MILLISECONDS,
    healthProbeTimeoutMilliseconds: SHORT_PROBE_MILLISECONDS,
    ...overrides,
  };
}

async function servingPageServer(overrides: Partial<PageServerOptions> = {}): Promise<PageServer> {
  const startVerdict = await startPageServer(optionsWith(overrides));
  if (startVerdict.verdict !== 'serving') throw new Error(`The page server did not start: ${JSON.stringify(startVerdict)}`);
  serversToStop.push(startVerdict.pageServer);
  return startVerdict.pageServer;
}

/** Every answer of the server passes here, so each case also holds that the answer carries the page's CSP. */
async function answerOf(pageServer: PageServer, path: string, requestOptions: RequestInit = {}): Promise<Response> {
  const response = await fetch(new URL(path, pageServer.url), { redirect: 'manual', ...requestOptions });
  expect(response.headers.get('content-security-policy')).toBe(PAGE_POLICY);
  return response;
}

function storedToken(): string {
  return readFileSync(serverTokenPathIn(homeDirectory), 'utf8');
}

function withBearer(token: string): RequestInit {
  return { method: 'POST', headers: { authorization: `Bearer ${token}` } };
}

async function issuedCode(pageServer: PageServer): Promise<string> {
  const response = await answerOf(pageServer, '/api/session-codes', withBearer(storedToken()));
  expect(response.status).toBe(200);
  const { code } = await response.json() as { readonly code: string };
  return code;
}

function sessionExchange(code: unknown): RequestInit {
  return { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code }) };
}

/** The `name=secret` pair a browser sends back for the cookie the exchange set. */
async function sessionCookieOf(pageServer: PageServer): Promise<string> {
  const response = await answerOf(pageServer, '/api/session', sessionExchange(await issuedCode(pageServer)));
  expect(response.status).toBe(204);
  return (response.headers.get('set-cookie') ?? '').split(';')[0] ?? '';
}

interface EventReader {
  readonly nextEvent: () => Promise<ServerSentEvent>;
  readonly untilEnd:  () => Promise<void>;
}

function eventReaderOf(response: Response): EventReader {
  const reader  = response.body?.getReader();
  if (reader === undefined) throw new Error('The event stream has no body.');
  const decoder = new TextDecoder();
  const parser  = eventStreamParserOf();
  const waiting: ServerSentEvent[] = [];
  return {
    nextEvent: async () => {
      while (waiting.length === 0) {
        const chunk = await reader.read();
        if (chunk.done) throw new Error('The event stream ended before the next event.');
        waiting.push(...parser.eventsOf(decoder.decode(chunk.value, { stream: true })));
      }
      return waiting.shift() as ServerSentEvent;
    },
    untilEnd: async () => {
      for (let chunk = await reader.read(); !chunk.done; chunk = await reader.read()) parser.eventsOf(decoder.decode(chunk.value, { stream: true }));
    },
  };
}

async function openEvents(pageServer: PageServer, cookie: string): Promise<{ readonly response: Response; readonly events: EventReader }> {
  const streamAbort = new AbortController();
  streamsToAbort.push(streamAbort);
  const response = await answerOf(pageServer, '/api/events', { headers: { cookie }, signal: streamAbort.signal });
  return { response, events: eventReaderOf(response) };
}

describe('a headless start under a scratch home', () => {
  test('listens on 127.0.0.1, on any free port when asked for port 0', async () => {
    const pageServer = await servingPageServer();
    expect(pageServer.url.hostname).toBe('127.0.0.1');
    expect(pageServer.port).toBeGreaterThan(0);
    expect(pageServer.url.port).toBe(String(pageServer.port));
  });

  test('writes a fresh owner-only token in an owner-only folder at every start', async () => {
    const firstServer = await servingPageServer();
    const firstToken  = storedToken();
    await firstServer.stop();
    await servingPageServer();

    expect(firstToken).toMatch(/^[0-9a-f]{64}$/);
    expect(storedToken()).toMatch(/^[0-9a-f]{64}$/);
    expect(storedToken()).not.toBe(firstToken);
    expect(statSync(serverTokenPathIn(homeDirectory)).mode & PERMISSION_BITS).toBe(OWNER_ONLY_FILE_MODE);
    expect(statSync(join(homeDirectory, '.gaia')).mode & PERMISSION_BITS).toBe(OWNER_ONLY_FOLDER_MODE);
  });

  test('writes the server record once it listens, and removes it when it stops', async () => {
    const pageServer = await servingPageServer();
    const record = JSON.parse(readFileSync(serverRecordPathIn(homeDirectory), 'utf8')) as unknown;
    expect(record).toEqual({
      version:   1,
      url:       pageServer.url.href,
      origin:    pageServer.url.origin,
      processId: PROCESS_ID,
      startedAt: STARTED_AT,
    });

    expect(await pageServer.stop()).toEqual({ verdict: 'removed' });
    expect(() => statSync(serverRecordPathIn(homeDirectory))).toThrow();
  });

  test('buys a session with a code, reads the fleet, and hears a fleet event after a store change', async () => {
    const pageServer = await servingPageServer();
    const cookie = await sessionCookieOf(pageServer);

    const fleetAnswer = await answerOf(pageServer, '/api/fleet', { headers: { cookie } });
    expect(fleetAnswer.status).toBe(200);
    expect(await fleetAnswer.json()).toEqual(FleetDocumentMapUtil.fleetDocumentOf(FLEET_SNAPSHOT_EMPTY));

    const { response, events } = await openEvents(pageServer, cookie);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('text/event-stream');
    const firstEvent = await events.nextEvent();
    expect([firstEvent.eventName, JSON.parse(firstEvent.data)]).toEqual(['fleet', FleetDocumentMapUtil.fleetDocumentOf(FLEET_SNAPSHOT_EMPTY)]);

    expect(fleetStore.publish(FLEET_SNAPSHOT_FIVE_FORGES)).toBe('published');
    const changeEvent = await events.nextEvent();
    expect([changeEvent.eventName, JSON.parse(changeEvent.data)]).toEqual(['fleet', FleetDocumentMapUtil.fleetDocumentOf(FLEET_SNAPSHOT_FIVE_FORGES)]);
  });

  test('marks the session cookie HttpOnly and SameSite=Strict under a name that carries its port', async () => {
    const pageServer = await servingPageServer();
    const response = await answerOf(pageServer, '/api/session', sessionExchange(await issuedCode(pageServer)));
    const attributes = (response.headers.get('set-cookie') ?? '').split('; ');
    expect(attributes[0]?.startsWith(`gaia-session-${pageServer.port}=`)).toBe(true);
    expect(attributes).toContain('HttpOnly');
    expect(attributes).toContain('SameSite=Strict');
  });

  test('answers its health to any local caller, with how far it is with its forges', async () => {
    const pageServer = await servingPageServer();
    const response = await answerOf(pageServer, '/api/health');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      application:      'gaia',
      healthVersion:    1,
      installVersion:   1,
      forgesRegistered: 5,
      forgesAnswered:   3,
    });
  });

  test('serves the page and its files to anyone, and answers a page file it does not have as not found', async () => {
    const pageServer = await servingPageServer();
    const page = await answerOf(pageServer, '/');
    expect([page.status, page.headers.get('content-type'), await page.text()]).toEqual([200, 'text/html;charset=utf-8', STAND_IN_PAGE]);
    const chunk = await answerOf(pageServer, '/chunk-example.js');
    expect([chunk.status, await chunk.text()]).toEqual([200, STAND_IN_CHUNK]);
    expect((await answerOf(pageServer, '/chunk-absent.js')).status).toBe(404);
  });

  test('answers a page that cannot be built as a failure', async () => {
    const pageServer = await servingPageServer({ pageFiles: () => Promise.resolve({ verdict: 'unbuildable', failure: 'example failure' }) });
    expect((await answerOf(pageServer, '/')).status).toBe(500);
  });

  test('answers a route that fails inside as a failure, with the CSP all the same', async () => {
    const pageServer = await servingPageServer({
      forgeCounts: () => {
        throw new Error('An example failure inside a route.');
      },
    });
    expect((await answerOf(pageServer, '/api/health')).status).toBe(500);
  });

  test('reads the fleet for a holder of the token as well as for a session', async () => {
    const pageServer = await servingPageServer();
    const response = await answerOf(pageServer, '/api/fleet', { headers: { authorization: `Bearer ${storedToken()}` } });
    expect(response.status).toBe(200);
  });
});

describe('one refused request per guard', () => {
  test('refuses a foreign Origin', async () => {
    const pageServer = await servingPageServer();
    const response = await answerOf(pageServer, '/api/session-codes', { method: 'POST', headers: { authorization: `Bearer ${storedToken()}`, origin: 'https://foreign.example' } });
    expect(response.status).toBe(403);
  });

  test('refuses the text null as Origin', async () => {
    const pageServer = await servingPageServer();
    const response = await answerOf(pageServer, '/api/session', { ...sessionExchange(await issuedCode(pageServer)), headers: { origin: 'null' } });
    expect(response.status).toBe(403);
  });

  test('refuses a rebound Host', async () => {
    const pageServer = await servingPageServer();
    const response = await answerOf(pageServer, '/api/health', { headers: { host: `rebound.example:${pageServer.port}` } });
    expect(response.status).toBe(403);
  });

  test('refuses a preflight, even from its own origin', async () => {
    const pageServer = await servingPageServer();
    const response = await answerOf(pageServer, '/api/fleet', { method: 'OPTIONS', headers: { origin: pageServer.url.origin, 'access-control-request-method': 'GET' } });
    expect(response.status).toBe(403);
    expect(response.headers.get('access-control-allow-origin')).toBeNull();
  });

  test('refuses a spent code', async () => {
    const pageServer = await servingPageServer();
    const code = await issuedCode(pageServer);
    expect((await answerOf(pageServer, '/api/session', sessionExchange(code))).status).toBe(204);
    const spent = await answerOf(pageServer, '/api/session', sessionExchange(code));
    expect(spent.status).toBe(401);
    expect(spent.headers.get('set-cookie')).toBeNull();
  });

  test('refuses a wrong token', async () => {
    const pageServer = await servingPageServer();
    expect((await answerOf(pageServer, '/api/session-codes', withBearer('f'.repeat(64)))).status).toBe(401);
    expect((await answerOf(pageServer, '/api/session-codes', { method: 'POST' })).status).toBe(401);
  });

  test('refuses the fleet and its events to a request with neither session nor token', async () => {
    const pageServer = await servingPageServer();
    expect((await answerOf(pageServer, '/api/fleet')).status).toBe(401);
    expect((await answerOf(pageServer, '/api/events')).status).toBe(401);
    expect((await answerOf(pageServer, '/api/fleet', { headers: { cookie: `gaia-session-${pageServer.port}=${'0'.repeat(64)}` } })).status).toBe(401);
  });

  test('refuses a session code that is no string, or a body that is no JSON', async () => {
    const pageServer = await servingPageServer();
    expect((await answerOf(pageServer, '/api/session', sessionExchange(4790))).status).toBe(400);
    expect((await answerOf(pageServer, '/api/session', { method: 'POST', body: 'code' })).status).toBe(400);
  });

  test('answers an unknown API address as not found, and a known one under another method as not allowed', async () => {
    const pageServer = await servingPageServer();
    expect((await answerOf(pageServer, '/api/unknown')).status).toBe(404);
    expect((await answerOf(pageServer, '/api/fleet', { method: 'POST' })).status).toBe(405);
    expect((await answerOf(pageServer, '/', { method: 'POST' })).status).toBe(404);
  });
});

describe('a start where something already answers', () => {
  test('refuses to start where Gaia answers its health, and leaves that Gaia\'s token and record as they are', async () => {
    const runningServer = await servingPageServer();
    const tokenBefore   = storedToken();
    const recordBefore  = readFileSync(serverRecordPathIn(homeDirectory), 'utf8');

    const startVerdict = await startPageServer(optionsWith({ port: runningServer.port, processId: PROCESS_ID + 1 }));
    expect(startVerdict).toEqual({ verdict: 'gaia-already-serving', url: runningServer.url });
    expect(storedToken()).toBe(tokenBefore);
    expect(readFileSync(serverRecordPathIn(homeDirectory), 'utf8')).toBe(recordBefore);
  });

  test('answers that the port is unavailable where another program listens', async () => {
    const otherProgram = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch: () => Response.json({ application: 'another-program' }) });
    try {
      const startVerdict = await startPageServer(optionsWith({ port: otherProgram.port ?? 0 }));
      expect(startVerdict.verdict).toBe('port-unavailable');
      expect(() => statSync(serverRecordPathIn(homeDirectory))).toThrow();
    } finally {
      await otherProgram.stop(true);
    }
  });
});

describe('a stop', () => {
  test('ends every open event stream and leaves no heartbeat behind', async () => {
    const pageServer = await servingPageServer();
    const { events } = await openEvents(pageServer, await sessionCookieOf(pageServer));
    await events.nextEvent();
    expect(timers.pendingDelays()).toEqual([HEARTBEAT_MILLISECONDS]);

    await pageServer.stop();
    await events.untilEnd();
    expect(timers.pendingDelays()).toEqual([]);
  });
});
