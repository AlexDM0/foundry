/**
 * The port a board's Overseer prefers and the Overseer API's guards and streams, over planted routes. What matters: the preferred port is a
 * pure function of the tracker id inside `OVERSEER_PORT_FIRST` and its count, so a board keeps it across restarts; a port in use moves the
 * bind upward while a given port is refused; the identity answers only once the start is done; a foreign Host, a foreign Origin, an
 * agent-dashboard frame Origin and any preflight get 403 with no CORS header, while a server's Origin-less write with the token is
 * routed; the five data routes answer only the bearer token or the HttpOnly session cookie a one-time code buys, never headers a local
 * program can forge, and the code is spent by one exchange; every answer carries the page CSP but a served job file, which is sandboxed
 * plain text and only `report.json` or `gate.log`; the event stream replays after a `Last-Event-ID` of its generation and pings; a
 * job stream sends its history then each new entry; a picture upload needs the token and a body, and a served picture is never sniffed,
 * never cached and sandboxed.
 */
import { createHash } from 'node:crypto';
import {
  afterEach,
  describe,
  expect,
  test
} from 'bun:test';

import { WATCHER_PROTOCOL_VERSION }                           from '../../lib/watcher/constants/WatcherProtocol.ts';
import type { TranscriptEntry }                               from '../../shared/@types/TranscriptEntry.ts';
import { OperationRefusal }                                   from '../../shared/OperationRefusal.ts';
import { IDENTITY_VERSION }                                   from '../../shared/constants/OverseerContracts.ts';
import { OVERSEER_PORT_COUNT, SESSION_CODE_LIFETIME_SECONDS } from '../../shared/constants/OverseerLimits.ts';
import { PRODUCT_NAMES }                                      from '../../shared/constants/ProductNames.ts';
import { recordAnswer }                                       from '../../testing/RecordedAnswers.ts';
import {
  OVERSEER_CALL_SHAPES,
  OVERSEER_PLACEHOLDERS,
  recordedHttpResponseOf,
  type RecordedFetchFailure,
  type RecordedPortRefusal
} from '../../testing/RecordedOverseerFetch.ts';
import type { BoardState }                     from './BoardState.ts';
import { EventBroker }                         from './EventBroker.ts';
import { OverseerPort }                        from './OverseerPort.ts';
import { OverseerServer, type OverseerRoutes } from './OverseerServer.ts';

const EXAMPLE_TRACKER_ID = 'example-tracker-id';
const TOKEN              = 'example-token';
const DASHBOARD_ORIGIN   = 'http://127.0.0.1:4800';
const TOKEN_HEADERS      = { authorization: `Bearer ${TOKEN}` };
/** The five routes that answer board data, each of which takes the session cookie or the bearer token. */
const DATA_ROUTE_PATHS   = ['api/session-token', 'api/state', 'api/events', 'api/jobs/J1/stream', 'api/jobs/J1/files/report.json'];

const SHORT_HEARTBEAT_MILLISECONDS = 20;

const EXAMPLE_PICTURE_BYTES = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const EXAMPLE_PICTURE_ID    = 'a'.repeat(64);

const stoppers: (() => Promise<void> | void)[] = [];

afterEach(async () => {
  for (const stop of stoppers.splice(0)) await stop();
});

function exampleState(ticketCount: number): BoardState {
  return {
    ticketCount,
    page:       { payload: { generatedAtEpochMilliseconds: 1 }, tickets: [] },
    jobs:       [],
    endedJobs:  [],
    decisions:  [],
    incidents:  [],
    notices:    [],
    mergeQueue: { queuedTicketIds: [], slots: [] },
    overseer:   {
      state: 'serving', paused: false, url: null, generation: 1, codeVersion: 'code-example', installVersion: 17, batonPassWarning: null
    },
    usage: { resetsAt: null, window: null },
  } as unknown as BoardState;
}

function startExampleServer(
  overrides: Partial<OverseerRoutes> = {},
  now: () => Date = () => new Date('2026-10-29T20:00:00Z'),
  processId = process.pid,
  heartbeatMilliseconds?: number,
) {
  const commands: unknown[] = [];
  const nudges: string[] = [];
  const pictureUploads: Uint8Array[] = [];
  const broker = EventBroker.createEventBroker(1);
  const routes: OverseerRoutes = {
    token:   () => TOKEN,
    started: () => true,
    command: async (body) => {
      commands.push(body);
      return { status: 200, body: { outcome: 'done', result: null } };
    },
    onNudge:      () => nudges.push('nudge'),
    state:        () => ({ notices: [{ kind: 'install-version-changed' }] }),
    summary:      () => ({ summaryVersion: 1 }),
    events:       () => broker,
    transcriptOf: (jobId) => (jobId === 'J1' ? () => [] : null),
    jobFileText:  (_jobId, fileName) => `text of ${fileName}`,
    storePicture: (upload) => {
      if (upload.verdict === 'over-limit') return { status: 413, body: { refusal: 'too-large' } };
      pictureUploads.push(upload.bytes);
      return { status: 200, body: { pictureId: EXAMPLE_PICTURE_ID, bytes: upload.bytes.length, mediaType: 'image/png' } };
    },
    picture:      (pictureId) => (pictureId === EXAMPLE_PICTURE_ID ? { mediaType: 'image/png', bytes: EXAMPLE_PICTURE_BYTES } : null),
    frameOrigins: () => [DASHBOARD_ORIGIN],
    ...overrides,
  };
  const server = OverseerServer.start({
    portChoice: { kind: 'given', port: 0 },
    identity:   {
      trackerId: EXAMPLE_TRACKER_ID, project: 'Example Agency', codeVersion: 'code-example', installVersion: 17, processId
    },
    routes,
    now,
    ...(heartbeatMilliseconds === undefined ? {} : { heartbeatMilliseconds }),
  });
  stoppers.push(() => server.stop());
  return {
    server, commands, nudges, broker, pictureUploads
  };
}

/**
 * Reads an event stream until its text satisfies `isComplete`, then closes it. `whenFirstRead` runs on the stream's first chunk: a client that
 * has read one is subscribed, so what it then publishes cannot miss it.
 */
async function streamTextUntil(response: Response, isComplete: (text: string) => boolean, { whenFirstRead }: { whenFirstRead?: () => void } = {}): Promise<string> {
  const reader = response.body?.getReader();
  if (reader === undefined) throw new Error('no body');
  const decoder = new TextDecoder();
  let text = '';
  while (!isComplete(text)) {
    const chunk = await reader.read();
    if (chunk.done) break;
    if (text === '') whenFirstRead?.();
    text += decoder.decode(chunk.value);
  }
  await reader.cancel();
  return text;
}

async function sessionCodeOf(serverUrl: string): Promise<string> {
  const answer = await fetch(new URL('api/session-codes', serverUrl), { method: 'POST', headers: TOKEN_HEADERS });
  const { code } = await answer.json() as { code: string };
  return code;
}

function exchangeCode(serverUrl: string, code: string): Promise<Response> {
  return fetch(new URL('api/session', serverUrl), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code }) });
}

function hasNoCorsHeader(response: Response): boolean {
  return [...response.headers.keys()].every((name) => !name.startsWith('access-control-'));
}

describe('OverseerPort', () => {
  test('the preferred port is OVERSEER_PORT_FIRST plus the first four digest bytes modulo the count, the same on every call', () => {
    const digest = createHash('sha256').update(EXAMPLE_TRACKER_ID).digest();
    const expected = PRODUCT_NAMES.OVERSEER_PORT_FIRST + (digest.readUInt32BE(0) % OVERSEER_PORT_COUNT);
    expect(OverseerPort.preferredPortOf(EXAMPLE_TRACKER_ID)).toBe(expected);
    expect(OverseerPort.preferredPortOf(EXAMPLE_TRACKER_ID)).toBe(OverseerPort.preferredPortOf(EXAMPLE_TRACKER_ID));
  });

  test('a preferred port in use moves the bind upward, while a given port in use is refused overseer-port-in-use', () => {
    const preferred = OverseerPort.preferredPortOf(EXAMPLE_TRACKER_ID);
    const inUse = (port: number) => {
      if (port === preferred) throw Object.assign(new Error('in use'), { code: 'EADDRINUSE' });
      return port;
    };
    expect(OverseerPort.bindFirstFree({ kind: 'preferred', trackerId: EXAMPLE_TRACKER_ID }, inUse)).toBe(preferred + 1);
    expect(() => OverseerPort.bindFirstFree({ kind: 'given', port: preferred }, inUse)).toThrow(OperationRefusal);
    expect(() => OverseerPort.bindFirstFree({ kind: 'given', port: 1 }, () => {
      throw new Error('another failure');
    })).toThrow('another failure');
  });
});

describe('OverseerServer guards', () => {
  test('binds 127.0.0.1 and answers /api/identity with the identity document', async () => {
    const { server } = startExampleServer();
    expect(server.url).toBe(`http://127.0.0.1:${server.port}/`);
    const response = await fetch(new URL('api/identity', server.url));
    expect(await response.json()).toEqual({
      identityVersion:        IDENTITY_VERSION,
      application:            PRODUCT_NAMES.PROGRAM,
      trackerId:              EXAMPLE_TRACKER_ID,
      project:                'Example Agency',
      codeVersion:            'code-example',
      installVersion:         17,
      watcherProtocolVersion: WATCHER_PROTOCOL_VERSION,
      processId:              process.pid,
      contracts:              { embed: 1 },
    });
  });

  test('/api/identity answers 503 starting until the start is done, then the identity, so oversee --detach returns only after the start', async () => {
    let started = false;
    const { server } = startExampleServer({ started: () => started });
    const whileStarting = await fetch(new URL('api/identity', server.url));
    expect(whileStarting.status).toBe(503);
    expect(await whileStarting.json()).toEqual({ refusal: 'starting' });
    started = true;
    const onceStarted = await fetch(new URL('api/identity', server.url));
    expect(onceStarted.status).toBe(200);
    expect(await onceStarted.json()).toMatchObject({ trackerId: EXAMPLE_TRACKER_ID });
  });

  test('a command is routed only with the bearer token and no foreign Origin: a server\'s Origin-less write with the token is accepted', async () => {
    const { server, commands } = startExampleServer();
    const commandsUrl = new URL('api/commands', server.url);
    const post = (headers: Record<string, string>) => fetch(commandsUrl, { method: 'POST', headers, body: JSON.stringify({ kind: 'overseer-pause' }) });

    expect((await post({})).status).toBe(401);
    expect((await post({ authorization: 'Bearer another-token' })).status).toBe(401);
    expect((await post({ authorization: `Bearer ${TOKEN}`, host: 'example.com' })).status).toBe(403);
    expect((await post({ authorization: `Bearer ${TOKEN}`, host: `example.com:${server.port}` })).status).toBe(403);
    expect(commands).toEqual([]);
    expect((await post({ authorization: `Bearer ${TOKEN}` })).status).toBe(200);
    expect((await post({ authorization: `Bearer ${TOKEN}`, host: `localhost:${server.port}` })).status).toBe(200);
    expect((await post({ authorization: `Bearer ${TOKEN}`, origin: `http://127.0.0.1:${server.port}` })).status).toBe(200);
    expect(commands).toEqual([{ kind: 'overseer-pause' }, { kind: 'overseer-pause' }, { kind: 'overseer-pause' }]);
  });

  test('a foreign Origin, an agent-dashboard frame Origin and a preflight get 403 with no CORS header, so the token never reaches their page', async () => {
    const { server, commands } = startExampleServer();
    const commandsUrl = new URL('api/commands', server.url);
    const refusals = [
      await fetch(commandsUrl, { method: 'POST', headers: { authorization: `Bearer ${TOKEN}`, origin: 'https://example.com' }, body: '{}' }),
      await fetch(commandsUrl, { method: 'POST', headers: { authorization: `Bearer ${TOKEN}`, origin: DASHBOARD_ORIGIN }, body: '{}' }),
      await fetch(commandsUrl, { method: 'OPTIONS', headers: { 'access-control-request-method': 'POST' } }),
      await fetch(new URL('api/session-token', server.url), { headers: { origin: DASHBOARD_ORIGIN, 'sec-fetch-site': 'same-origin' } }),
      await fetch(new URL('api/session-codes', server.url), { method: 'POST', headers: { ...TOKEN_HEADERS, origin: DASHBOARD_ORIGIN } }),
    ];
    expect(refusals.map((response) => response.status)).toEqual([403, 403, 403, 403, 403]);
    expect(refusals.every(hasNoCorsHeader)).toBe(true);
    expect(commands).toEqual([]);
  });

  test('A1: every data route answers 401 to a local client forging Sec-Fetch-Site, a loopback Host and the own Origin with no cookie', async () => {
    const { server } = startExampleServer();
    const forgedBrowserHeaders = { 'sec-fetch-site': 'same-origin', host: `127.0.0.1:${server.port}`, origin: `http://127.0.0.1:${server.port}` };
    const statuses: Record<string, number> = {};
    for (const path of DATA_ROUTE_PATHS) statuses[path] = (await fetch(new URL(path, server.url), { headers: forgedBrowserHeaders })).status;
    expect(statuses).toEqual(Object.fromEntries(DATA_ROUTE_PATHS.map((path) => [path, 401])));
  });

  test('every data route answers the bearer token, and none answers a wrong one', async () => {
    const { server } = startExampleServer();
    for (const path of DATA_ROUTE_PATHS) {
      expect((await fetch(new URL(path, server.url), { headers: { authorization: 'Bearer another-token' } })).status).toBe(401);
      const answered = await fetch(new URL(path, server.url), { headers: TOKEN_HEADERS });
      expect(answered.status).toBe(200);
      await answered.body?.cancel();
    }
  });

  test('A2: a code from POST /api/session-codes, which needs the token, buys one HttpOnly SameSite=Strict cookie once; a second exchange is 401', async () => {
    const { server } = startExampleServer();
    expect((await fetch(new URL('api/session-codes', server.url), { method: 'POST' })).status).toBe(401);
    const code = await sessionCodeOf(server.url);
    const exchanged = await exchangeCode(server.url, code);
    expect(exchanged.status).toBe(200);
    const cookie = exchanged.headers.get('set-cookie') ?? '';
    expect(cookie).toStartWith(`${PRODUCT_NAMES.PROGRAM}-session-${server.port}=`);
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Strict');
    expect(cookie).toContain('Path=/');
    expect(cookie).not.toContain(code);
    expect(hasNoCorsHeader(exchanged)).toBe(true);
    expect((await exchangeCode(server.url, code)).status).toBe(401);
    expect((await exchangeCode(server.url, 'another-code')).status).toBe(401);
    expect((await fetch(new URL('api/session', server.url), { method: 'POST', body: '{' })).status).toBe(401);
  });

  test('a code exchanged past SESSION_CODE_LIFETIME_SECONDS is 401 and sets no cookie', async () => {
    let epochMilliseconds = Date.parse('2026-10-29T20:00:00Z');
    const { server } = startExampleServer({}, () => new Date(epochMilliseconds));
    const code = await sessionCodeOf(server.url);
    epochMilliseconds += (SESSION_CODE_LIFETIME_SECONDS + 1) * 1000;
    const exchanged = await exchangeCode(server.url, code);
    expect(exchanged.status).toBe(401);
    expect(exchanged.headers.get('set-cookie')).toBeNull();
  });

  test('the session cookie opens every data route, the session token included; a forged cookie opens none', async () => {
    const { server } = startExampleServer();
    const sessionCookie = (await exchangeCode(server.url, await sessionCodeOf(server.url))).headers.get('set-cookie')?.split(';')[0] ?? '';
    const tokenAnswer = await fetch(new URL('api/session-token', server.url), { headers: { cookie: sessionCookie } });
    expect(await tokenAnswer.json()).toEqual({ token: TOKEN });
    expect(hasNoCorsHeader(tokenAnswer)).toBe(true);
    for (const path of DATA_ROUTE_PATHS) {
      const answered = await fetch(new URL(path, server.url), { headers: { cookie: `other=1; ${sessionCookie}` } });
      expect(answered.status).toBe(200);
      await answered.body?.cancel();
    }
    const [cookieName] = sessionCookie.split('=');
    expect((await fetch(new URL('api/state', server.url), { headers: { cookie: `${cookieName}=forged` } })).status).toBe(401);
    const foreignHost = await fetch(new URL('api/session-token', server.url), { headers: { cookie: sessionCookie, host: `example.com:${server.port}` } });
    expect(foreignHost.status).toBe(403);
  });

  test('A5: the exchange reads the code only from its JSON body: a code in the query string is refused and stays unspent', async () => {
    const { server } = startExampleServer();
    const code = await sessionCodeOf(server.url);
    expect((await fetch(new URL(`api/session?code=${code}`, server.url), { method: 'POST' })).status).toBe(401);
    expect((await exchangeCode(server.url, code)).status).toBe(200);
  });

  test('every answer carries the page CSP, framed only by agent-dashboard\'s origin; a refusal too', async () => {
    const { server } = startExampleServer();
    for (const path of ['api/identity', 'api/state', 'api/missing']) {
      const policy = (await fetch(new URL(path, server.url), { headers: TOKEN_HEADERS })).headers.get('content-security-policy') ?? '';
      expect(policy).toContain('default-src \'self\'');
      expect(policy).toContain(`frame-ancestors ${DASHBOARD_ORIGIN}`);
    }
    const refused = await fetch(new URL('api/state', server.url), { headers: { origin: 'https://example.com' } });
    expect(refused.headers.get('content-security-policy')).toContain('frame-ancestors');
  });

  test('a job serves only report.json and gate.log, as plain text under a sandbox CSP', async () => {
    const { server } = startExampleServer();
    const report = await fetch(new URL('api/jobs/J1/files/report.json', server.url), { headers: TOKEN_HEADERS });
    expect(report.status).toBe(200);
    expect(report.headers.get('content-type')).toStartWith('text/plain');
    expect(report.headers.get('content-security-policy')).toBe('sandbox');
    expect(await report.text()).toBe('text of report.json');
    expect(await (await fetch(new URL('api/jobs/J1/files/gate.log', server.url), { headers: TOKEN_HEADERS })).text()).toBe('text of gate.log');
    expect((await fetch(new URL('api/jobs/J1/files/events-1.ndjson', server.url), { headers: TOKEN_HEADERS })).status).toBe(404);
    expect((await fetch(new URL('api/jobs/J1/files/..%2Fprogress.json', server.url), { headers: TOKEN_HEADERS })).status).toBe(404);
  });

  test('a job path holding a malformed escape is a 404 under the page CSP, never a thrown 500', async () => {
    const { server } = startExampleServer();
    for (const path of ['api/jobs/%E0/files/report.json', 'api/jobs/J1/files/%E0', 'api/jobs/%E0/stream']) {
      const response = await fetch(new URL(path, server.url));
      expect(response.status).toBe(404);
      expect(response.headers.get('content-security-policy')).toContain('default-src \'self\'');
    }
  });

  test('a body-less POST /api/nudge only schedules a pass, without a token; /api/state and /api/summary answer their documents', async () => {
    const { server, nudges, commands } = startExampleServer();
    expect((await fetch(new URL('api/nudge', server.url), { method: 'POST' })).status).toBe(200);
    expect((await fetch(new URL('api/nudge', server.url), { method: 'POST', headers: { origin: 'https://example.com' } })).status).toBe(403);
    expect(nudges).toEqual(['nudge']);
    expect(commands).toEqual([]);
    expect(await (await fetch(new URL('api/state', server.url), { headers: TOKEN_HEADERS })).json()).toEqual({ notices: [{ kind: 'install-version-changed' }] });
    expect(await (await fetch(new URL('api/summary', server.url))).json()).toEqual({ summaryVersion: 1 });
  });

  test('a body that is no JSON is refused 400 before any route sees it', async () => {
    const { server, commands } = startExampleServer();
    const response = await fetch(new URL('api/commands', server.url), { method: 'POST', headers: { authorization: `Bearer ${TOKEN}` }, body: '{' });
    expect(response.status).toBe(400);
    expect(commands).toEqual([]);
  });
});

describe('OverseerServer pictures', () => {
  const upload = (serverUrl: string, body: Uint8Array, authorization = `Bearer ${TOKEN}`) => {
    const headers = { authorization, 'content-type': 'image/png' };
    return fetch(new URL('api/pictures', serverUrl), { method: 'POST', headers, body });
  };

  test('an upload reaches the route only with the bearer token and a body: another token is 401, an empty body 400', async () => {
    const { server, pictureUploads } = startExampleServer();
    expect((await upload(server.url, EXAMPLE_PICTURE_BYTES, 'Bearer another-token')).status).toBe(401);
    expect((await upload(server.url, new Uint8Array())).status).toBe(400);
    const stored = await upload(server.url, EXAMPLE_PICTURE_BYTES);
    expect(stored.status).toBe(200);
    expect(await stored.json()).toEqual({ pictureId: EXAMPLE_PICTURE_ID, bytes: EXAMPLE_PICTURE_BYTES.length, mediaType: 'image/png' });
    expect(pictureUploads.map((bytes) => [...bytes])).toEqual([[...EXAMPLE_PICTURE_BYTES]]);
  });

  test('a served picture carries its stored type, nosniff, a sandbox CSP and no-store; it needs the token or the cookie', async () => {
    const { server } = startExampleServer();
    const at = new URL(`api/pictures/${EXAMPLE_PICTURE_ID}`, server.url);
    expect((await fetch(at)).status).toBe(401);
    const served = await fetch(at, { headers: TOKEN_HEADERS });
    expect(served.status).toBe(200);
    expect({
      type:     served.headers.get('content-type'),
      sniffing: served.headers.get('x-content-type-options'),
      policy:   served.headers.get('content-security-policy'),
      caching:  served.headers.get('cache-control'),
    }).toEqual({
      type: 'image/png', sniffing: 'nosniff', policy: 'sandbox', caching: 'no-store'
    });
    expect([...new Uint8Array(await served.arrayBuffer())]).toEqual([...EXAMPLE_PICTURE_BYTES]);
  });

  test('an id no picture has is a 404, and a path that is no sha256 is no picture route', async () => {
    const { server } = startExampleServer();
    for (const path of [`api/pictures/${'b'.repeat(64)}`, 'api/pictures/..%2Fprogress.json', 'api/pictures/short']) {
      expect((await fetch(new URL(path, server.url), { headers: TOKEN_HEADERS })).status).toBe(404);
    }
  });
});

describe('OverseerServer streams', () => {
  test('GET /api/events starts from the newest board, then sends each published event with its id', async () => {
    const { server, broker } = startExampleServer();
    broker.publishState(exampleState(1));
    const response = await fetch(new URL('api/events', server.url), { headers: TOKEN_HEADERS });
    expect(response.headers.get('content-type')).toBe('text/event-stream');
    const text = await streamTextUntil(response, (soFar) => soFar.includes('id: 1-2\nevent: board'), { whenFirstRead: () => broker.publishState(exampleState(2)), });
    expect(text).toStartWith('id: 1-1\nevent: board\n');
    expect(text).toContain('"ticketCount":2');
  });

  test('a reconnect whose Last-Event-ID is of this generation gets only what it missed; another generation\'s starts fresh', async () => {
    const { server, broker } = startExampleServer();
    broker.publishState(exampleState(1));
    broker.publishState(exampleState(2));
    broker.publishState(exampleState(3));
    const replayed = await streamTextUntil(
      await fetch(new URL('api/events', server.url), { headers: { ...TOKEN_HEADERS, 'last-event-id': '1-1' } }),
      (text) => text.includes('id: 1-3'),
    );
    expect(replayed.match(/^id: .+$/gm)).toEqual(['id: 1-2', 'id: 1-3']);
    const fresh = await streamTextUntil(
      await fetch(new URL('api/events', server.url), { headers: { ...TOKEN_HEADERS, 'last-event-id': '7-2' } }),
      (text) => text.includes('\n\n'),
    );
    expect(fresh).toStartWith('id: 1-3\nevent: board\n');
  });

  test('a quiet event stream gets a ": ping" every heartbeat', async () => {
    const { server, broker } = startExampleServer({}, undefined, undefined, SHORT_HEARTBEAT_MILLISECONDS);
    broker.publishState(exampleState(1));
    const text = await streamTextUntil(await fetch(new URL('api/events', server.url), { headers: TOKEN_HEADERS }), (soFar) => soFar.includes(': ping\n\n'));
    expect(text).toContain(': ping\n\n');
  });

  test('GET /api/jobs/<J>/stream sends the history after the cursor, then each new entry with its cursor as the id', async () => {
    const entries: TranscriptEntry[] = [{
      cursor: '1.1', role: 'assistant', text: 'first', entryKey: '1.1.0', at: null
    }];
    const cursorsAsked: (string | null)[] = [];
    const { server, broker } = startExampleServer({
      transcriptOf: (jobId, after) => {
        cursorsAsked.push(after);
        if (jobId !== 'J1') return null;
        return () => entries.splice(0);
      },
    });
    expect((await fetch(new URL('api/jobs/J9/stream', server.url), { headers: TOKEN_HEADERS })).status).toBe(404);
    const response = await fetch(new URL('api/jobs/J1/stream?after=1.0', server.url), { headers: TOKEN_HEADERS });
    const text = await streamTextUntil(response, (soFar) => soFar.includes('event: message'), {
      whenFirstRead: () => {
        entries.push({
          cursor: '2.1', role: 'tool-call', text: 'ls', toolName: 'Bash', entryKey: '2.1.0', at: null
        });
        broker.publishState(exampleState(1));
      },
    });
    expect(text).toStartWith('id: 1.1\nevent: history\ndata: [{"cursor":"1.1"');
    expect(text).toContain('id: 2.1\nevent: message\ndata: {"cursor":"2.1","role":"tool-call"');
    expect(cursorsAsked).toEqual([null, '1.0']);
  });
});

describe('the answers the Overseer clients read', () => {
  const RECORDED_PROCESS_ID = 4242;
  const INSTALL_HELD_REFUSAL = `The install version changed: run \`${PRODUCT_NAMES.PROGRAM} update\`.`;

  test('A1: each route a client calls answers, and each refusal refuses, as recorded under the record command', async () => {
    const installHeldAnswer = { status: 423, body: { refusal: INSTALL_HELD_REFUSAL } };
    const { server } = startExampleServer({ command: async () => installHeldAnswer }, undefined, RECORDED_PROCESS_ID);
    const replacements: [string, string][] = [[String(server.port), OVERSEER_PLACEHOLDERS.PORT], [TOKEN, OVERSEER_PLACEHOLDERS.TOKEN]];
    const recordedAs = async (callShape: string, response: Promise<Response>, expectedStatus: number): Promise<Response> => {
      const answered = await response;
      expect(answered.status, callShape).toBe(expectedStatus);
      recordAnswer(callShape, await recordedHttpResponseOf(answered.clone(), replacements));
      return answered;
    };
    const at = (path: string) => new URL(path, server.url);

    await recordedAs(OVERSEER_CALL_SHAPES.IDENTITY, fetch(at('api/identity')), 200);
    await recordedAs(OVERSEER_CALL_SHAPES.SESSION_TOKEN_NO_SESSION, fetch(at('api/session-token')), 401);
    await recordedAs(OVERSEER_CALL_SHAPES.STATE_NO_SESSION, fetch(at('api/state')), 401);
    await recordedAs(OVERSEER_CALL_SHAPES.STATE, fetch(at('api/state'), { headers: TOKEN_HEADERS }), 200);
    await recordedAs(OVERSEER_CALL_SHAPES.SESSION_CODE_NO_TOKEN, fetch(at('api/session-codes'), { method: 'POST' }), 401);

    const codeAnswer = await fetch(at('api/session-codes'), { method: 'POST', headers: TOKEN_HEADERS });
    const { code } = await codeAnswer.clone().json() as { code: string };
    replacements.push([code, OVERSEER_PLACEHOLDERS.SESSION_CODE]);
    await recordedAs(OVERSEER_CALL_SHAPES.SESSION_CODE, Promise.resolve(codeAnswer), 200);

    const exchanged = await exchangeCode(server.url, code);
    const cookie = (exchanged.headers.get('set-cookie') ?? '').split(';')[0] ?? '';
    replacements.push([cookie.slice(cookie.indexOf('=') + 1), OVERSEER_PLACEHOLDERS.SESSION_SECRET]);
    await recordedAs(OVERSEER_CALL_SHAPES.SESSION_EXCHANGE, Promise.resolve(exchanged), 200);
    await recordedAs(OVERSEER_CALL_SHAPES.SESSION_EXCHANGE_SPENT, exchangeCode(server.url, code), 401);
    await recordedAs(OVERSEER_CALL_SHAPES.SESSION_TOKEN, fetch(at('api/session-token'), { headers: { cookie } }), 200);

    const command = (authorization: string) => fetch(at('api/commands'), { method: 'POST', headers: { authorization }, body: JSON.stringify({ kind: 'overseer-pause' }) });
    await recordedAs(OVERSEER_CALL_SHAPES.COMMAND_WITH_ANOTHER_TOKEN, command('Bearer another-token'), 401);
    await recordedAs(OVERSEER_CALL_SHAPES.COMMAND_INSTALL_HELD, command(TOKEN_HEADERS.authorization), 423);
    const pictureUpload = fetch(at('api/pictures'), { method: 'POST', headers: { authorization: 'Bearer another-token' }, body: EXAMPLE_PICTURE_BYTES });
    await recordedAs(OVERSEER_CALL_SHAPES.PICTURE_WITH_ANOTHER_TOKEN, pictureUpload, 401);
    await recordedAs(OVERSEER_CALL_SHAPES.NUDGE, fetch(at('api/nudge'), { method: 'POST' }), 200);
    await recordedAs(OVERSEER_CALL_SHAPES.FOREIGN_HOST, fetch(at('api/identity'), { headers: { host: `example.com:${server.port}` } }), 403);
    await recordedAs(OVERSEER_CALL_SHAPES.FOREIGN_ORIGIN, fetch(at('api/identity'), { headers: { origin: 'http://example.com' } }), 403);

    let portRefusal: unknown = null;
    try {
      OverseerServer.start({
        portChoice: { kind: 'given', port: server.port },
        identity:   {
          trackerId: EXAMPLE_TRACKER_ID, project: 'Example Agency', codeVersion: 'code-example', installVersion: 17, processId: RECORDED_PROCESS_ID
        },
        // The bind fails before any route is asked.
        routes: { token: () => TOKEN } as unknown as OverseerRoutes,
        now:    () => new Date('2026-10-29T20:00:00Z'),
      });
    } catch (error) {
      portRefusal = error;
    }
    expect(portRefusal).toBeInstanceOf(OperationRefusal);
    const { status, detail } = portRefusal as OperationRefusal;
    const recordedDetail = Object.fromEntries(Object.entries(detail ?? {}).map(([field, value]) => [field, value === server.port ? OVERSEER_PLACEHOLDERS.PORT : value]));
    const recordedPortRefusal: RecordedPortRefusal = { status, detail: recordedDetail };
    recordAnswer(OVERSEER_CALL_SHAPES.PORT_TAKEN, recordedPortRefusal);

    await server.stop();
    let fetchFailure: unknown = null;
    try {
      await fetch(at('api/identity'));
    } catch (error) {
      fetchFailure = error;
    }
    expect(fetchFailure).toBeInstanceOf(Error);
    const { name, message, code: failureCode } = fetchFailure as Error & { code?: string };
    const recordedFailure: RecordedFetchFailure = { name, code: failureCode ?? '', message };
    recordAnswer(OVERSEER_CALL_SHAPES.NOTHING_LISTENS, recordedFailure);
  });
});
