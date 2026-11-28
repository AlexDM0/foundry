/**
 * The page server, headless on a free port under a scratch home: the page's whole road from token to cookie to fleet event, one refusal per guard,
 * the command port, the relay routes behind the session guard, body bounds, the CSP on every answer, and versioned paths only but `/api/versions`.
 * Stand-ins replace the page build, forge-control and the relays, whose own specs hold them.
 */
import {
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  test
} from 'bun:test';

import { serverTokenPathIn }                                                  from '../../adapters/gaia-files/ServerTokenFile.ts';
import { FleetDocumentMapUtil }                                               from '../../adapters/page-api/FleetDocumentMapUtil.ts';
import { FLEET_SNAPSHOT_EMPTY }                                               from '../../adapters/page-api/testing/fleet-snapshot-empty.ts';
import { FLEET_SNAPSHOT_FIVE_FORGES }                                         from '../../adapters/page-api/testing/fleet-snapshot-five-forges.ts';
import { eventStreamParserOf, type ServerSentEvent }                          from '../../lib/event-stream/EventStreamParser.ts';
import { forgeClientOf }                                                      from '../../lib/forge-client/ForgeClient.ts';
import { diagramFrameContentSecurityPolicyFor, pageContentSecurityPolicyFor } from '../../lib/local-http-guards/ContentSecurityPolicy.ts';
import { createFleetStore, type FleetStore }                                  from '../../services/FleetStore.ts';
import type { CommandVerdict }                                                from '../../shared/@types/CommandVerdict.ts';
import type { FleetSnapshot }                                                 from '../../shared/@types/FleetSnapshot.ts';
import type { GaiaCommand }                                                   from '../../shared/@types/GaiaCommand.ts';
import { GAIA_SYSTEM_VERSION, MINIMUM_SUPPORTED_GAIA_VERSION }                from '../../shared/constants/GaiaSystemVersions.ts';
import { TICKET_DOCUMENT_COMMAND_BODY_BOUND_BYTES }                           from '../../shared/constants/Limits.ts';
import { SUPPORTED_FORGE_VERSION }                                            from '../../shared/constants/SupportedForgeVersions.ts';
import { manualTimers, type ManualTimers }                                    from '../../testing/ManualTimers.ts';
import { recordedHephaestusFetch, type RecordedHephaestusFetch }              from '../../testing/RecordedAnswers.ts';
import { createScratchDirectory, removeScratchPath }                          from '../../testing/ScratchRoot.ts';
import type { BoardRelayLogEntry }                                            from './@types/BoardRelayLogEntry.ts';
import { startPageServer, type PageServer, type PageServerOptions }           from './PageServer.ts';
import type { PageFilesSource }                                               from './routes/PageFilesRoute.ts';
import { boardAnswering, exampleRelayForgeOf, relaySourcesOver }              from './testing/ExampleRelayForge.ts';

const PAGE_POLICY = pageContentSecurityPolicyFor();

const HEARTBEAT_MILLISECONDS = 1_000;
const SHORT_PROBE_MILLISECONDS = 500;
const EARLIER_TOKEN = `${'0'.repeat(63)}1`;

const OWNER_ONLY_FILE_MODE = 0o600;
const OWNER_ONLY_FOLDER_MODE = 0o700;
const PERMISSION_BITS = 0o777;

const STAND_IN_PAGE = '<!doctype html><title>Gaia</title><script type="module" src="./chunk-example.js"></script>';
const STAND_IN_CHUNK = 'document.title = "Gaia";';

const STAND_IN_DIAGRAM_FRAME = '<!doctype html><title>Diagram</title><script src="DiagramFrameScript.js"></script>';
const STAND_IN_DIAGRAM_FRAME_SCRIPT = 'document.title = "Diagram";';

const standInDiagramFrameFiles: PageFilesSource = () => Promise.resolve({
  verdict: 'built',
  files:   new Map([
    ['/diagram-frame/', new Blob([STAND_IN_DIAGRAM_FRAME], { type: 'text/html;charset=utf-8' })],
    ['/diagram-frame/DiagramFrameScript.js', new Blob([STAND_IN_DIAGRAM_FRAME_SCRIPT], { type: 'text/javascript;charset=utf-8' })],
  ]),
});

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
let carriedCommands: GaiaCommand[];
let nextCommandVerdict: CommandVerdict;
let hephaestusFetch: RecordedHephaestusFetch;
let relayLogEntries: BoardRelayLogEntry[];

beforeEach(() => {
  homeDirectory  = createScratchDirectory('page-server-home');
  fleetStore     = createFleetStore(FLEET_SNAPSHOT_EMPTY);
  timers         = manualTimers();
  serversToStop  = [];
  streamsToAbort = [];
  carriedCommands    = [];
  nextCommandVerdict = { verdict: 'done' };
  hephaestusFetch      = recordedHephaestusFetch([]);
  relayLogEntries    = [];
});

afterEach(async () => {
  for (const streamAbort of streamsToAbort) streamAbort.abort();
  for (const pageServer of serversToStop) await pageServer.stop();
  removeScratchPath(homeDirectory);
});

function optionsWith(overrides: Partial<PageServerOptions> = {}): PageServerOptions {
  return {
    port:              0,
    homeDirectory,
    fleetStore,
    forgeCounts:       () => ({ forgesRegistered: 5, forgesAnswered: 3 }),
    pageFiles:         standInPageFiles,
    diagramFrameFiles: standInDiagramFrameFiles,
    carryCommand:      (command) => {
      carriedCommands.push(command);
      return Promise.resolve(nextCommandVerdict);
    },
    forgeAccessSources: {
      readRegistry:            () => Promise.resolve({ verdict: 'absent' }),
      readings:                () => [],
      presenceReadingAfterNow: () => Promise.resolve(null),
      forgeClient:             forgeClientOf({ supportedForgeVersion: SUPPORTED_FORGE_VERSION, hephaestusFetch }),
    },
    logBoardRelay: (entry) => {
      relayLogEntries.push(entry);
    },
    timers,
    heartbeatIntervalMilliseconds:  HEARTBEAT_MILLISECONDS,
    healthProbeTimeoutMilliseconds: SHORT_PROBE_MILLISECONDS,
    ...overrides,
  };
}

/** The diagram frame's files carry the frame's own policy, so this asks without `answerOf`'s check for the page's. */
function diagramFrameAnswerOf(pageServer: PageServer, path: string): Promise<Response> {
  return fetch(new URL(path, pageServer.url));
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
  const response = await answerOf(pageServer, '/api/v1/session-codes', withBearer(storedToken()));
  expect(response.status).toBe(200);
  const { code } = await response.json() as { readonly code: string };
  return code;
}

function sessionExchange(code: unknown): RequestInit {
  return { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code }) };
}

/** The `name=secret` pair a browser sends back for the cookie the exchange set. */
async function sessionCookieOf(pageServer: PageServer): Promise<string> {
  const response = await answerOf(pageServer, '/api/v1/session', sessionExchange(await issuedCode(pageServer)));
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

async function openEvents(pageServer: PageServer, cookie: string, path = '/api/v12/events'): Promise<{ readonly response: Response; readonly events: EventReader }> {
  const streamAbort = new AbortController();
  streamsToAbort.push(streamAbort);
  const response = await answerOf(pageServer, path, { headers: { cookie }, signal: streamAbort.signal });
  return { response, events: eventReaderOf(response) };
}

function fleetEventDocumentOf(snapshot: FleetSnapshot): unknown {
  return { ...FleetDocumentMapUtil.fleetDocumentOf(snapshot), systemVersion: GAIA_SYSTEM_VERSION };
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

  test('buys a session with a code, reads the fleet, and hears a fleet event after a store change', async () => {
    const pageServer = await servingPageServer();
    const cookie = await sessionCookieOf(pageServer);

    const fleetAnswer = await answerOf(pageServer, '/api/v12/fleet', { headers: { cookie } });
    expect([fleetAnswer.status, fleetAnswer.headers.get('content-type')]).toEqual([200, 'application/json;charset=utf-8']);
    expect(await fleetAnswer.json()).toEqual(FleetDocumentMapUtil.fleetDocumentOf(FLEET_SNAPSHOT_EMPTY));

    const { response, events } = await openEvents(pageServer, cookie);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('text/event-stream');
    const handshake = await events.nextEvent();
    expect([handshake.eventName, JSON.parse(handshake.data)]).toEqual(['handshake', { systemVersion: GAIA_SYSTEM_VERSION }]);
    const firstEvent = await events.nextEvent();
    expect([firstEvent.eventName, JSON.parse(firstEvent.data)]).toEqual(['fleet', fleetEventDocumentOf(FLEET_SNAPSHOT_EMPTY)]);

    expect(fleetStore.publish(FLEET_SNAPSHOT_FIVE_FORGES)).toBe('published');
    const changeEvent = await events.nextEvent();
    expect([changeEvent.eventName, JSON.parse(changeEvent.data)]).toEqual(['fleet', fleetEventDocumentOf(FLEET_SNAPSHOT_FIVE_FORGES)]);
  });

  test('marks the session cookie HttpOnly and SameSite=Strict under a name that carries its port', async () => {
    const pageServer = await servingPageServer();
    const response = await answerOf(pageServer, '/api/v1/session', sessionExchange(await issuedCode(pageServer)));
    const attributes = (response.headers.get('set-cookie') ?? '').split('; ');
    expect(attributes[0]?.startsWith(`gaia-session-${pageServer.port}=`)).toBe(true);
    expect(attributes).toContain('HttpOnly');
    expect(attributes).toContain('SameSite=Strict');
  });

  test('answers its health to any local caller, with how far it is with its forges', async () => {
    const pageServer = await servingPageServer();
    const response = await answerOf(pageServer, '/api/v1/health');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      application:      'gaia',
      healthVersion:    1,
      installVersion:   2,
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

  test('serves the page under a CSP that frames its own origin alone, so the sandboxed srcdoc frame loads and no forge\'s server does', async () => {
    const pageServer = await servingPageServer();
    const policy = (await answerOf(pageServer, '/')).headers.get('content-security-policy') ?? '';
    expect(policy.split('; ').filter((directive) => directive.startsWith('frame-'))).toEqual(['frame-ancestors \'none\'', 'frame-src \'self\'']);
  });

  test('serves the diagram frame and its script to anyone under the frame\'s own sandboxed policy, never the page\'s', async () => {
    const pageServer = await servingPageServer();
    const frame = await diagramFrameAnswerOf(pageServer, '/diagram-frame/');
    expect([frame.status, frame.headers.get('content-security-policy'), await frame.text()]).toEqual([200, diagramFrameContentSecurityPolicyFor(), STAND_IN_DIAGRAM_FRAME]);
    const script = await diagramFrameAnswerOf(pageServer, '/diagram-frame/DiagramFrameScript.js');
    const framePolicy = diagramFrameContentSecurityPolicyFor();
    expect([script.status, script.headers.get('content-security-policy'), await script.text()]).toEqual([200, framePolicy, STAND_IN_DIAGRAM_FRAME_SCRIPT]);
    const absent = await answerOf(pageServer, '/diagram-frame/absent.js');
    expect([absent.status, absent.headers.get('content-security-policy')]).toEqual([404, PAGE_POLICY]);
  });

  test('keeps the Host and Origin guards on the diagram frame, which a classic script asks for with no Origin', async () => {
    const pageServer = await servingPageServer();
    expect((await answerOf(pageServer, '/diagram-frame/', { headers: { host: `rebound.example:${pageServer.port}` } })).status).toBe(403);
    expect((await answerOf(pageServer, '/diagram-frame/DiagramFrameScript.js', { headers: { origin: 'null' } })).status).toBe(403);
    expect((await answerOf(pageServer, '/diagram-frame/DiagramFrameScript.js', { headers: { origin: 'https://foreign.example' } })).status).toBe(403);
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
    expect((await answerOf(pageServer, '/api/v1/health')).status).toBe(500);
  });

  test('reads the fleet for a holder of the token as well as for a session', async () => {
    const pageServer = await servingPageServer();
    const response = await answerOf(pageServer, '/api/v12/fleet', { headers: { authorization: `Bearer ${storedToken()}` } });
    expect(response.status).toBe(200);
  });
});

function commandRequest(cookie: string, commandDocument: unknown): RequestInit {
  return { method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify(commandDocument) };
}

describe('a command', () => {
  test('is read, carried through the command port, and answered with its verdict in the page contract', async () => {
    const pageServer = await servingPageServer();
    const cookie = await sessionCookieOf(pageServer);
    const response = await answerOf(pageServer, '/api/v6/commands', commandRequest(cookie, { commandVersion: 5, kind: 'fleet-look-again' }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      answerVersion: 3, outcome: 'done', refusal: null, text: null, forges: []
    });
    expect(carriedCommands).toEqual([{ kind: 'fleet-look-again' }]);
  });

  test('answers a forge\'s refusal with its code and its sentence unchanged, under a conflict status', async () => {
    const pageServer = await servingPageServer();
    nextCommandVerdict = {
      verdict: 'refused', refusedBy: 'forge', refusal: 'hephaestus-held', text: 'Hephaestus is held by an install change.'
    };
    const stopCommand = {
      commandVersion: 5, kind: 'forge-stop', trackerId: 'example-storefront-7c41', agents: 'keep'
    };
    const response = await answerOf(pageServer, '/api/v6/commands', commandRequest(await sessionCookieOf(pageServer), stopCommand));
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      answerVersion: 3,
      outcome:       'refused',
      refusal:       'hephaestus-held',
      text:          'Hephaestus is held by an install change.',
      forges:        [],
    });
    expect(carriedCommands).toEqual([{ kind: 'forge-stop', trackerId: 'example-storefront-7c41', agents: 'keep' }]);
  });

  test('answers each verdict under its own status', async () => {
    const pageServer = await servingPageServer();
    const cookie = await sessionCookieOf(pageServer);
    const verdicts: readonly CommandVerdict[] = [
      { verdict: 'nothing-to-do' },
      { verdict: 'refused', refusedBy: 'gaia', refusal: 'command-in-flight' },
      { verdict: 'unreachable' },
      { verdict: 'not-supported' },
    ];
    const statuses: number[] = [];
    for (const verdict of verdicts) {
      nextCommandVerdict = verdict;
      statuses.push((await answerOf(pageServer, '/api/v6/commands', commandRequest(cookie, { commandVersion: 5, kind: 'fleet-look-again' }))).status);
    }
    expect(statuses).toEqual([200, 409, 502, 501]);
  });

  test('that Gaia cannot read is answered as not supported, and nothing is carried', async () => {
    const pageServer = await servingPageServer();
    const response = await answerOf(pageServer, '/api/v6/commands', commandRequest(await sessionCookieOf(pageServer), { commandVersion: 1, kind: 'fleet-look-again' }));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      answerVersion: 3, outcome: 'not-supported', refusal: 'other-version', text: null, forges: []
    });
    expect(carriedCommands).toEqual([]);
  });

  test('is refused without a session, and nothing is carried', async () => {
    const pageServer = await servingPageServer();
    const response = await answerOf(pageServer, '/api/v6/commands', { method: 'POST', body: JSON.stringify({ commandVersion: 5, kind: 'fleet-look-again' }) });
    expect(response.status).toBe(401);
    expect(carriedCommands).toEqual([]);
  });
});

describe('a frame session', () => {
  test('has no route: the page frames no forge, so a frame session is not found, behind the session guard or not', async () => {
    const pageServer = await servingPageServer();
    const cookie = await sessionCookieOf(pageServer);
    for (const path of ['/api/v1/forges/example-storefront-7c41/frame-session', '/api/v2/forges/example-storefront-7c41/frame-session']) {
      expect([path, (await answerOf(pageServer, path, { method: 'POST', headers: { cookie } })).status]).toEqual([path, 404]);
    }
    expect(hephaestusFetch.callsAnswered()).toEqual([]);
  });
});

const RELAY_PATHS: readonly { readonly method: 'GET' | 'POST'; readonly endpoint: string }[] = [
  { method: 'GET', endpoint: 'forges/example-storefront-7c41/board' },
  { method: 'GET', endpoint: 'forges/example-storefront-7c41/board/events' },
  { method: 'GET', endpoint: 'forges/example-storefront-7c41/jobs/J4/stream' },
  { method: 'GET', endpoint: 'forges/example-storefront-7c41/profiles/P1/stream' },
  { method: 'POST', endpoint: 'forges/example-storefront-7c41/pictures' },
  { method: 'GET', endpoint: 'forges/example-storefront-7c41/pictures/6b7fa434f92a8b80aab02d9bf1a12e49ffcae424e4013a1c4f68b67e3d2bbcd0' },
  { method: 'POST', endpoint: 'forges/example-storefront-7c41/commands' },
  { method: 'GET', endpoint: 'forges/example-storefront-7c41/tickets/001/documents' },
];

/** One byte over the bound of every route but the picture upload. */
const OVER_ROUTE_BOUND_BYTES = 65_537;

describe('the relay of a forge\'s board', () => {
  test('answers each route at its versioned path, behind the session guard, and at no unversioned one', async () => {
    const pageServer = await servingPageServer();
    const cookie = await sessionCookieOf(pageServer);
    const body = JSON.stringify({
      boardCommandVersion: 3, kind: 'ticket-hold', ticketId: '001', reason: 'Waits for the example provider.'
    });
    for (const { method, endpoint } of RELAY_PATHS) {
      const bodyOfMethod = method === 'POST' ? { body } : {};
      const path = `/api/v1/${endpoint}`;
      expect([path, (await answerOf(pageServer, path, { method, ...bodyOfMethod })).status]).toEqual([path, 401]);
      const answer = await answerOf(pageServer, path, { method, headers: { cookie }, ...bodyOfMethod });
      expect([path, answer.status, (await answer.text()).includes('"forge-not-registered"')]).toEqual([path, 404, true]);
      const unversioned = await answerOf(pageServer, `/api/${endpoint}`, { method, headers: { cookie }, ...bodyOfMethod });
      expect([endpoint, unversioned.status, (await unversioned.text()).includes('"forge-not-registered"')]).toEqual([endpoint, 404, false]);
    }
    expect(hephaestusFetch.callsAnswered()).toEqual([]);
  });

  test('refuses a body one byte over the bound on Gaia\'s commands route, and over a ticket document\'s bound on a forge\'s, and takes it on the picture route', async () => {
    const pageServer = await servingPageServer();
    const cookie = await sessionCookieOf(pageServer);
    const oversized = { method: 'POST', headers: { cookie }, body: new Uint8Array(OVER_ROUTE_BOUND_BYTES) };
    expect((await answerOf(pageServer, '/api/v6/commands', oversized)).status).toBe(413);
    const overTheDocumentBound = { method: 'POST', headers: { cookie }, body: new Uint8Array(TICKET_DOCUMENT_COMMAND_BODY_BOUND_BYTES + 1) };
    expect((await answerOf(pageServer, '/api/v1/forges/example-storefront-7c41/commands', overTheDocumentBound)).status).toBe(413);
    const picture = await answerOf(pageServer, '/api/v1/forges/example-storefront-7c41/pictures', oversized);
    expect([picture.status, ((await picture.json()) as { readonly refusal: { readonly code: string } }).refusal.code]).toEqual([404, 'forge-not-registered']);
    expect(carriedCommands).toEqual([]);
  });
});

describe('one refused request per guard', () => {
  test('refuses a foreign Origin', async () => {
    const pageServer = await servingPageServer();
    const foreignOrigin = { method: 'POST', headers: { authorization: `Bearer ${storedToken()}`, origin: 'https://foreign.example' } };
    const response = await answerOf(pageServer, '/api/v1/session-codes', foreignOrigin);
    expect(response.status).toBe(403);
  });

  test('refuses the text null as Origin', async () => {
    const pageServer = await servingPageServer();
    const response = await answerOf(pageServer, '/api/v1/session', { ...sessionExchange(await issuedCode(pageServer)), headers: { origin: 'null' } });
    expect(response.status).toBe(403);
  });

  test('refuses a rebound Host', async () => {
    const pageServer = await servingPageServer();
    const response = await answerOf(pageServer, '/api/v1/health', { headers: { host: `rebound.example:${pageServer.port}` } });
    expect(response.status).toBe(403);
  });

  test('refuses a preflight, even from its own origin', async () => {
    const pageServer = await servingPageServer();
    const response = await answerOf(pageServer, '/api/v12/fleet', { method: 'OPTIONS', headers: { origin: pageServer.url.origin, 'access-control-request-method': 'GET' } });
    expect(response.status).toBe(403);
    expect(response.headers.get('access-control-allow-origin')).toBeNull();
  });

  test('refuses a spent code', async () => {
    const pageServer = await servingPageServer();
    const code = await issuedCode(pageServer);
    expect((await answerOf(pageServer, '/api/v1/session', sessionExchange(code))).status).toBe(204);
    const spent = await answerOf(pageServer, '/api/v1/session', sessionExchange(code));
    expect(spent.status).toBe(401);
    expect(spent.headers.get('set-cookie')).toBeNull();
  });

  test('refuses a wrong token', async () => {
    const pageServer = await servingPageServer();
    expect((await answerOf(pageServer, '/api/v1/session-codes', withBearer('f'.repeat(64)))).status).toBe(401);
    expect((await answerOf(pageServer, '/api/v1/session-codes', { method: 'POST' })).status).toBe(401);
  });

  test('refuses the fleet and its events to a request with neither session nor token', async () => {
    const pageServer = await servingPageServer();
    expect((await answerOf(pageServer, '/api/v12/fleet')).status).toBe(401);
    expect((await answerOf(pageServer, '/api/v12/events')).status).toBe(401);
    expect((await answerOf(pageServer, '/api/v12/fleet', { headers: { cookie: `gaia-session-${pageServer.port}=${'0'.repeat(64)}` } })).status).toBe(401);
  });

  test('refuses a session code that is no string, or a body that is no JSON', async () => {
    const pageServer = await servingPageServer();
    expect((await answerOf(pageServer, '/api/v1/session', sessionExchange(4790))).status).toBe(400);
    expect((await answerOf(pageServer, '/api/v1/session', { method: 'POST', body: 'code' })).status).toBe(400);
  });

  test('answers an unknown API address as not found, and a known one under another method as not allowed', async () => {
    const pageServer = await servingPageServer();
    expect((await answerOf(pageServer, '/api/unknown')).status).toBe(404);
    expect((await answerOf(pageServer, '/api/v12/fleet', { method: 'POST' })).status).toBe(405);
    expect((await answerOf(pageServer, '/', { method: 'POST' })).status).toBe(404);
  });
});

describe('the versioned paths', () => {
  test('answer Gaia\'s system version and its minimum supported at /api/versions, open to any local caller and never cached', async () => {
    const pageServer = await servingPageServer();
    const response = await answerOf(pageServer, '/api/versions');
    expect([response.status, response.headers.get('cache-control')]).toEqual([200, 'no-store']);
    expect(await response.json()).toEqual({ current: GAIA_SYSTEM_VERSION, minimumSupported: MINIMUM_SUPPORTED_GAIA_VERSION });
    expect([GAIA_SYSTEM_VERSION, MINIMUM_SUPPORTED_GAIA_VERSION]).toEqual([{ major: 4, minor: 4 }, { major: 4, minor: 0 }]);
  });

  test('serve /api/versions at no versioned path', async () => {
    const pageServer = await servingPageServer();
    expect((await answerOf(pageServer, '/api/v1/versions')).status).toBe(404);
  });

  test('carry the whole road of the page at each route\'s own version', async () => {
    const pageServer = await servingPageServer();
    expect((await answerOf(pageServer, '/api/v1/health')).status).toBe(200);
    const codeAnswer = await answerOf(pageServer, '/api/v1/session-codes', withBearer(storedToken()));
    const { code } = await codeAnswer.json() as { readonly code: string };
    const exchange = await answerOf(pageServer, '/api/v1/session', sessionExchange(code));
    expect(exchange.status).toBe(204);
    const cookie = (exchange.headers.get('set-cookie') ?? '').split(';')[0] ?? '';

    const fleetAnswer = await answerOf(pageServer, '/api/v12/fleet', { headers: { cookie } });
    expect(await fleetAnswer.json()).toEqual(FleetDocumentMapUtil.fleetDocumentOf(FLEET_SNAPSHOT_EMPTY));
    const { events } = await openEvents(pageServer, cookie, '/api/v12/events');
    expect((await events.nextEvent()).eventName).toBe('handshake');
    expect(JSON.parse((await events.nextEvent()).data)).toEqual(fleetEventDocumentOf(FLEET_SNAPSHOT_EMPTY));
    const command = await answerOf(pageServer, '/api/v6/commands', commandRequest(cookie, { commandVersion: 5, kind: 'fleet-look-again' }));
    expect([command.status, carriedCommands]).toEqual([200, [{ kind: 'fleet-look-again' }]]);
  });

  test('answer each route at no version but its own', async () => {
    const pageServer = await servingPageServer();
    for (const path of ['/api/v2/health', '/api/v11/fleet', '/api/v1/fleet', '/api/v11/events', '/api/v5/commands', '/api/v2/session-codes']) {
      expect([path, (await answerOf(pageServer, path)).status]).toEqual([path, 404]);
    }
  });

  test('answer no route at its unversioned path, which only a page or a launcher of Gaia 1 called', async () => {
    const pageServer = await servingPageServer();
    for (const path of ['/api/health', '/api/session-codes', '/api/session', '/api/fleet', '/api/events', '/api/commands']) {
      expect([path, (await answerOf(pageServer, path)).status]).toEqual([path, 404]);
    }
  });

  test('keep the Host, Origin and preflight guards on the versioned paths and on /api/versions', async () => {
    const pageServer = await servingPageServer();
    const foreignOrigin = { method: 'POST', headers: { authorization: `Bearer ${storedToken()}`, origin: 'https://foreign.example' } };
    expect((await answerOf(pageServer, '/api/v1/session-codes', foreignOrigin)).status).toBe(403);
    for (const path of ['/api/v1/health', '/api/versions']) {
      expect((await answerOf(pageServer, path, { headers: { host: `rebound.example:${pageServer.port}` } })).status).toBe(403);
      expect((await answerOf(pageServer, path, { headers: { origin: 'https://foreign.example' } })).status).toBe(403);
    }
    const preflight = { method: 'OPTIONS', headers: { origin: pageServer.url.origin, 'access-control-request-method': 'GET' } };
    expect((await answerOf(pageServer, '/api/v12/fleet', preflight)).status).toBe(403);
  });

  test('keep the token and session guards on the versioned paths', async () => {
    const pageServer = await servingPageServer();
    expect((await answerOf(pageServer, '/api/v1/session-codes', withBearer('f'.repeat(64)))).status).toBe(401);
    expect((await answerOf(pageServer, '/api/v12/fleet')).status).toBe(401);
    expect((await answerOf(pageServer, '/api/v12/events')).status).toBe(401);
    expect((await answerOf(pageServer, '/api/v6/commands', { method: 'POST', body: '{}' })).status).toBe(401);
    expect(carriedCommands).toEqual([]);
  });
});

describe('a start where something already answers', () => {
  test('refuses to start where Gaia answers its health, and leaves that Gaia\'s token as it is', async () => {
    const runningServer = await servingPageServer();
    const tokenBefore   = storedToken();

    const startVerdict = await startPageServer(optionsWith({ port: runningServer.port }));
    expect(startVerdict).toEqual({ verdict: 'gaia-already-serving', url: runningServer.url });
    expect(storedToken()).toBe(tokenBefore);
  });

  test('answers that the port is unavailable where another program listens', async () => {
    const otherProgram = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch: () => Response.json({ application: 'another-program' }) });
    try {
      const startVerdict = await startPageServer(optionsWith({ port: otherProgram.port ?? 0 }));
      expect(startVerdict.verdict).toBe('port-unavailable');
    } finally {
      await otherProgram.stop(true);
    }
  });

  test('leaves the token in place byte for byte when it loses the port, since the program that holds the port may be a Gaia that serves it', async () => {
    mkdirSync(join(homeDirectory, '.gaia'), { recursive: true });
    writeFileSync(serverTokenPathIn(homeDirectory), EARLIER_TOKEN);
    const otherProgram = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch: () => Response.json({ application: 'another-program' }) });
    try {
      expect((await startPageServer(optionsWith({ port: otherProgram.port ?? 0 }))).verdict).toBe('port-unavailable');
      expect(storedToken()).toBe(EARLIER_TOKEN);
    } finally {
      await otherProgram.stop(true);
    }
  });
});

describe('a start that cannot write its token', () => {
  test('answers unwritable for the token', async () => {
    writeFileSync(join(homeDirectory, '.gaia'), 'a file where the data folder belongs');
    const startVerdict = await startPageServer(optionsWith());
    expect(startVerdict).toMatchObject({ verdict: 'unwritable', file: 'token' });
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

  test('closes every open relayed stream and the forge stream it follows', async () => {
    const tokenPath = join(homeDirectory, 'example-hephaestus-token');
    writeFileSync(tokenPath, 'example-forge-token-0123456789abcdef\n');
    const forge = exampleRelayForgeOf(homeDirectory, tokenPath);
    const boardFetch = boardAnswering('board-at-work');
    const pageServer = await servingPageServer({ forgeAccessSources: relaySourcesOver(forge, boardFetch) });
    const { events } = await openEvents(pageServer, await sessionCookieOf(pageServer), '/api/v1/forges/example-storefront-7c41/board/events');
    expect((await events.nextEvent()).eventName).toBe('handshake');
    expect(boardFetch.streamsLeftOpen()).toBe(1);

    await pageServer.stop();
    await events.untilEnd();
    expect([boardFetch.streamsLeftOpen(), timers.pendingDelays()]).toEqual([0, []]);
  });

});
