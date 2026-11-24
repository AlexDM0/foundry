/**
 * The port a board's Hephaestus prefers and the Hephaestus API's guards and streams, over planted routes. What matters: the preferred port is a
 * pure function of the tracker id inside `HEPHAESTUS_PORT_FIRST` and its count, so a board keeps it across restarts; a port in use moves the
 * bind upward while a given port is refused; the identity answers only once the start is done; a foreign Host, a foreign Origin, an
 * Origin of another local page and any preflight get 403 with no CORS header, while a server's Origin-less write with the token is
 * routed; the data routes answer only the bearer token, never a cookie or headers a local program can forge, and the routes that once
 * gave a browser a session are a 404; every answer carries the API's CSP, which lets nothing frame it, but a served job file, which is
 * sandboxed plain text and only `report.json` or `gate.log`; each of the three streams opens with the handshake, which carries no id; the event
 * stream replays after a `Last-Event-ID` of its generation and pings; a job stream sends its history then each new entry; a gate profile
 * stream sends each output line after the cursor, then each appended line, while the board event stream carries none, and an unknown run
 * is a 404; a picture upload needs the token and a body, and a served picture is never sniffed, never cached and sandboxed.
 */
import { createHash } from 'node:crypto';
import {
  afterEach,
  describe,
  expect,
  test
} from 'bun:test';
import { FORGE_SYSTEM_VERSIONS } from 'forge-contracts/ForgeSystemVersions';

import { TALOS_PROTOCOL_VERSION } from '../../lib/talos/constants/TalosProtocol.ts';
import type { TranscriptEntry }   from '../../shared/@types/TranscriptEntry.ts';
import { OperationRefusal }       from '../../shared/OperationRefusal.ts';
import { HEPHAESTUS_PORT_COUNT }  from '../../shared/constants/HephaestusLimits.ts';
import { PRODUCT_NAMES }          from '../../shared/constants/ProductNames.ts';
import { recordAnswer }           from '../../testing/RecordedAnswers.ts';
import {
  HEPHAESTUS_CALL_SHAPES,
  HEPHAESTUS_PLACEHOLDERS,
  recordedHttpResponseOf,
  type RecordedFetchFailure,
  type RecordedPortRefusal
} from '../../testing/RecordedHephaestusFetch.ts';
import type { BoardState }                         from './BoardState.ts';
import { EventBroker }                             from './EventBroker.ts';
import { HephaestusPort }                          from './HephaestusPort.ts';
import { HephaestusServer, type HephaestusRoutes } from './HephaestusServer.ts';

const EXAMPLE_TRACKER_ID = 'example-tracker-id';
const TOKEN              = 'example-token';
const OTHER_LOCAL_ORIGIN = 'http://127.0.0.1:4800';
const TOKEN_HEADERS      = { authorization: `Bearer ${TOKEN}` };
/** The routes that answer board data, each of which takes the bearer token alone. */
const DATA_ROUTE_PATHS   = ['api/state', 'api/board', 'api/events', 'api/jobs/J1/stream', 'api/jobs/J1/files/report.json', 'api/profiles/P1/stream'];

const SHORT_HEARTBEAT_MILLISECONDS = 20;

const HANDSHAKE_TEXT = `event: handshake\ndata: ${JSON.stringify({ systemVersion: FORGE_SYSTEM_VERSIONS.current })}\n\n`;

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
    hephaestus: {
      state: 'serving', paused: false, url: null, generation: 1, codeVersion: 'code-example', installVersion: 17, restartWarning: null
    },
    usage:       { resetsAt: null, window: null, windows: [] },
    profileRuns: [],
  } as unknown as BoardState;
}

function startExampleServer(
  overrides: Partial<HephaestusRoutes> = {},
  processId = process.pid,
  heartbeatMilliseconds = SHORT_HEARTBEAT_MILLISECONDS,
) {
  const commands: unknown[] = [];
  const nudges: string[] = [];
  const pictureUploads: Uint8Array[] = [];
  const broker = EventBroker.createEventBroker(1);
  const routes: HephaestusRoutes = {
    token:   () => TOKEN,
    started: () => true,
    command: async (body) => {
      commands.push(body);
      return { status: 200, body: { outcome: 'done', result: null } };
    },
    onNudge:         () => nudges.push('nudge'),
    ticketDocuments: () => ({ status: 200, body: { ticketId: '001', documents: [], effectReadings: [] } }),
    state:           () => ({ notices: [{ kind: 'install-version-changed' }] }),
    board:           () => ({ project: 'Example Agency' }),
    summary:         () => ({ summaryVersion: 3 }),
    monitor:         () => ({ status: 200, body: { monitorVersion: 6 } }),
    presence:        () => ({ status: 200, body: { generation: 1 } }),
    crashLog:        () => ({ status: 404, body: { refusal: 'no-crash-log', number: null } }),
    monitorStream:   () => null,
    refusalTextOf:   (refusal) => `Example sentence for ${refusal}`,
    events:          () => broker,
    transcriptOf:    (jobId) => (jobId === 'J1' ? () => [] : null),
    profileOutputOf: (profileRunId) => (profileRunId === 'P1' ? () => [] : null),
    jobFileText:     (_jobId, fileName) => `text of ${fileName}`,
    storePicture:    (upload) => {
      if (upload.verdict === 'over-limit') return { status: 413, body: { refusal: 'too-large' } };
      pictureUploads.push(upload.bytes);
      return { status: 200, body: { pictureId: EXAMPLE_PICTURE_ID, bytes: upload.bytes.length, mediaType: 'image/png' } };
    },
    picture: (pictureId) => (pictureId === EXAMPLE_PICTURE_ID ? { mediaType: 'image/png', bytes: EXAMPLE_PICTURE_BYTES } : null),
    ...overrides,
  };
  const server = HephaestusServer.start({
    portChoice: { kind: 'given', port: 0 },
    identity:   {
      trackerId: EXAMPLE_TRACKER_ID, project: 'Example Agency', codeVersion: 'code-example', installVersion: 17, processId
    },
    routes,
    heartbeatMilliseconds,
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

function hasNoCorsHeader(response: Response): boolean {
  return [...response.headers.keys()].every((name) => !name.startsWith('access-control-'));
}

describe('HephaestusPort', () => {
  test('the preferred port is HEPHAESTUS_PORT_FIRST plus the first four digest bytes modulo the count, the same on every call', () => {
    const digest = createHash('sha256').update(EXAMPLE_TRACKER_ID).digest();
    const expected = PRODUCT_NAMES.HEPHAESTUS_PORT_FIRST + (digest.readUInt32BE(0) % HEPHAESTUS_PORT_COUNT);
    expect(HephaestusPort.preferredPortOf(EXAMPLE_TRACKER_ID)).toBe(expected);
    expect(HephaestusPort.preferredPortOf(EXAMPLE_TRACKER_ID)).toBe(HephaestusPort.preferredPortOf(EXAMPLE_TRACKER_ID));
  });

  test('a preferred port in use moves the bind upward, while a given port in use is refused hephaestus-port-in-use', () => {
    const preferred = HephaestusPort.preferredPortOf(EXAMPLE_TRACKER_ID);
    const inUse = (port: number) => {
      if (port === preferred) throw Object.assign(new Error('in use'), { code: 'EADDRINUSE' });
      return port;
    };
    expect(HephaestusPort.bindFirstFree({ kind: 'preferred', trackerId: EXAMPLE_TRACKER_ID }, inUse)).toBe(preferred + 1);
    expect(() => HephaestusPort.bindFirstFree({ kind: 'given', port: preferred }, inUse)).toThrow(OperationRefusal);
    expect(() => HephaestusPort.bindFirstFree({ kind: 'given', port: 1 }, () => {
      throw new Error('another failure');
    })).toThrow('another failure');
  });
});

describe('HephaestusServer guards', () => {
  test('binds 127.0.0.1 and answers /api/identity with the identity document', async () => {
    const { server } = startExampleServer();
    expect(server.url).toBe(`http://127.0.0.1:${server.port}/`);
    const response = await fetch(new URL('api/identity', server.url));
    expect(await response.json()).toEqual({
      identityVersion:      1,
      application:          PRODUCT_NAMES.PROGRAM,
      trackerId:            EXAMPLE_TRACKER_ID,
      project:              'Example Agency',
      codeVersion:          'code-example',
      installVersion:       17,
      talosProtocolVersion: TALOS_PROTOCOL_VERSION,
      processId:            process.pid,
      contracts:            { summary: 3, monitor: 6, control: 3 },
    });
  });

  test('/api/identity answers 503 starting until the start is done, then the identity, so start returns only after the start', async () => {
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
    const post = (headers: Record<string, string>) => fetch(commandsUrl, { method: 'POST', headers, body: JSON.stringify({ kind: 'hephaestus-pause' }) });

    expect((await post({})).status).toBe(401);
    expect((await post({ authorization: 'Bearer another-token' })).status).toBe(401);
    expect((await post({ authorization: `Bearer ${TOKEN}`, host: 'example.com' })).status).toBe(403);
    expect((await post({ authorization: `Bearer ${TOKEN}`, host: `example.com:${server.port}` })).status).toBe(403);
    expect(commands).toEqual([]);
    expect((await post({ authorization: `Bearer ${TOKEN}` })).status).toBe(200);
    expect((await post({ authorization: `Bearer ${TOKEN}`, host: `localhost:${server.port}` })).status).toBe(200);
    expect((await post({ authorization: `Bearer ${TOKEN}`, origin: `http://127.0.0.1:${server.port}` })).status).toBe(200);
    expect(commands).toEqual([{ kind: 'hephaestus-pause' }, { kind: 'hephaestus-pause' }, { kind: 'hephaestus-pause' }]);
  });

  test('a foreign Origin, the Origin of another local page and a preflight get 403 with no CORS header, so the token never reaches their page', async () => {
    const { server, commands } = startExampleServer();
    const commandsUrl = new URL('api/commands', server.url);
    const refusals = [
      await fetch(commandsUrl, { method: 'POST', headers: { authorization: `Bearer ${TOKEN}`, origin: 'https://example.com' }, body: '{}' }),
      await fetch(commandsUrl, { method: 'POST', headers: { authorization: `Bearer ${TOKEN}`, origin: OTHER_LOCAL_ORIGIN }, body: '{}' }),
      await fetch(commandsUrl, { method: 'OPTIONS', headers: { 'access-control-request-method': 'POST' } }),
      await fetch(new URL('api/state', server.url), { headers: { ...TOKEN_HEADERS, origin: OTHER_LOCAL_ORIGIN, 'sec-fetch-site': 'same-origin' } }),
    ];
    expect(refusals.map((response) => response.status)).toEqual([403, 403, 403, 403]);
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

  test('the routes that gave a browser a session are each a 404 that sets no cookie, with the token and without', async () => {
    const { server } = startExampleServer();
    const calls: { path: string; init: RequestInit }[] = [
      { path: 'api/session-codes', init: { method: 'POST' } },
      { path: 'api/v1/session-codes', init: { method: 'POST' } },
      { path: 'api/session', init: { method: 'POST', body: JSON.stringify({ code: 'example-code' }) } },
      { path: 'api/session-token', init: {} },
    ];
    for (const { path, init } of calls) {
      for (const headers of [TOKEN_HEADERS, {}]) {
        const answered = await fetch(new URL(path, server.url), { ...init, headers });
        expect([answered.status, await answered.json()], path).toEqual([404, { refusal: 'not-found' }]);
        expect(answered.headers.get('set-cookie'), path).toBeNull();
      }
    }
  });

  test('every data route answers 401 unauthorized to a cookie with no token, and its document to the token', async () => {
    const { server } = startExampleServer();
    const cookie = `${PRODUCT_NAMES.PROGRAM}-session-${server.port}=example-secret`;
    for (const path of DATA_ROUTE_PATHS) {
      const byCookie = await fetch(new URL(path, server.url), { headers: { cookie } });
      expect([byCookie.status, await byCookie.json()], path).toEqual([401, { refusal: 'unauthorized', text: 'Example sentence for unauthorized' }]);
      const byToken = await fetch(new URL(path, server.url), { headers: { ...TOKEN_HEADERS, cookie } });
      expect(byToken.status, path).toBe(200);
      await byToken.body?.cancel();
    }
  });

  test('every answer carries the API\'s CSP, which lets nothing frame it; a refusal and a 404 too', async () => {
    const { server } = startExampleServer();
    const answers = [
      await fetch(new URL('api/identity', server.url)),
      await fetch(new URL('api/state', server.url), { headers: TOKEN_HEADERS }),
      await fetch(new URL('api/missing', server.url), { headers: TOKEN_HEADERS }),
      await fetch(new URL('api/state', server.url)),
      await fetch(new URL('api/state', server.url), { headers: { origin: 'https://example.com' } }),
    ];
    expect(answers.map((answer) => answer.status)).toEqual([200, 200, 404, 401, 403]);
    for (const answer of answers) {
      const policy = answer.headers.get('content-security-policy') ?? '';
      expect(policy).toBe(HephaestusServer.API_CONTENT_SECURITY_POLICY);
      expect(/frame-ancestors ([^;]*)/.exec(policy)?.[1]).toBe('\'none\'');
    }
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

  test('a job path holding a malformed escape is a 404 under the API\'s CSP, never a thrown 500', async () => {
    const { server } = startExampleServer();
    for (const path of ['api/jobs/%E0/files/report.json', 'api/jobs/J1/files/%E0', 'api/jobs/%E0/stream']) {
      const response = await fetch(new URL(path, server.url));
      expect(response.status).toBe(404);
      expect(response.headers.get('content-security-policy')).toBe(HephaestusServer.API_CONTENT_SECURITY_POLICY);
    }
  });

  test('a body-less POST /api/nudge only schedules a pass, without a token; /api/state and /api/summary answer their documents', async () => {
    const { server, nudges, commands } = startExampleServer();
    expect((await fetch(new URL('api/nudge', server.url), { method: 'POST' })).status).toBe(200);
    expect((await fetch(new URL('api/nudge', server.url), { method: 'POST', headers: { origin: 'https://example.com' } })).status).toBe(403);
    expect(nudges).toEqual(['nudge']);
    expect(commands).toEqual([]);
    expect(await (await fetch(new URL('api/state', server.url), { headers: TOKEN_HEADERS })).json()).toEqual({ notices: [{ kind: 'install-version-changed' }] });
    expect(await (await fetch(new URL('api/summary', server.url))).json()).toEqual({ summaryVersion: 3 });
  });

  test('a body that is no JSON is refused 400 as the control contract\'s refusal, before any route sees it', async () => {
    const { server, commands } = startExampleServer();
    const response = await fetch(new URL('api/commands', server.url), { method: 'POST', headers: { authorization: `Bearer ${TOKEN}` }, body: '{' });
    expect(response.status).toBe(400);
    const malformedRefusal = {
      controlVersion: 3, refusal: 'malformed-body', fields: {}, text: 'Example sentence for malformed-body'
    };
    expect(await response.json()).toEqual(malformedRefusal);
    expect(commands).toEqual([]);
  });
});

describe('HephaestusServer pictures', () => {
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

  test('a served picture carries its stored type, nosniff, a sandbox CSP and no-store; it needs the token', async () => {
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

describe('HephaestusServer streams', () => {
  test('GET /api/events starts from the newest board, then sends each published event with its id', async () => {
    const { server, broker } = startExampleServer();
    broker.publishState(exampleState(1));
    const response = await fetch(new URL('api/events', server.url), { headers: TOKEN_HEADERS });
    expect(response.headers.get('content-type')).toBe('text/event-stream');
    const text = await streamTextUntil(response, (soFar) => soFar.includes('id: 1-2\nevent: board'), { whenFirstRead: () => broker.publishState(exampleState(2)), });
    expect(text).toStartWith(`${HANDSHAKE_TEXT}id: 1-1\nevent: board\n`);
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
      (text) => text.split('\n\n').length > 2,
    );
    expect(fresh).toStartWith(`${HANDSHAKE_TEXT}id: 1-3\nevent: board\n`);
  });

  test('a quiet event stream gets a ": ping" every heartbeat', async () => {
    const { server, broker } = startExampleServer();
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
    expect(text).toStartWith(`${HANDSHAKE_TEXT}id: 1.1\nevent: history\ndata: [{"cursor":"1.1"`);
    expect(text).toContain('id: 2.1\nevent: message\ndata: {"cursor":"2.1","role":"tool-call"');
    expect(cursorsAsked).toEqual([null, '1.0']);
  });
});

describe('HephaestusServer gate profile streams', () => {
  test('GET /api/profiles/<P>/stream sends each line after the cursor, then each appended line, with its number as the id', async () => {
    const appended = [{ lineNumber: 2, text: 'second' }];
    const cursorsAsked: (string | null)[] = [];
    const { server, broker } = startExampleServer({
      profileOutputOf: (profileRunId, after) => {
        cursorsAsked.push(after);
        return profileRunId === 'P1' ? () => appended.splice(0) : null;
      },
    });
    broker.publishState(exampleState(1));
    const events = await fetch(new URL('api/events', server.url), { headers: TOKEN_HEADERS });
    const response = await fetch(new URL('api/profiles/P1/stream', server.url), { headers: { ...TOKEN_HEADERS, 'last-event-id': '1' } });
    expect(response.headers.get('content-type')).toBe('text/event-stream');
    const text = await streamTextUntil(response, (soFar) => soFar.includes('id: 3\n'), {
      whenFirstRead: () => {
        appended.push({ lineNumber: 3, text: 'third' });
        broker.publishState(exampleState(2));
      },
    });
    expect(text).toStartWith(`${HANDSHAKE_TEXT}id: 2\nevent: line\ndata: {"text":"second"}\n\n`);
    expect(text).toContain('id: 3\nevent: line\ndata: {"text":"third"}\n\n');
    expect(text).not.toContain('event: board');
    const boardText = await streamTextUntil(events, (soFar) => soFar.includes('id: 1-2\n'));
    expect(boardText).not.toContain('third');
    expect(boardText).not.toContain('event: line');
    expect(cursorsAsked).toEqual(['1']);
  });

  test('a run the routes do not know is a 404, behind the same reader check as every data route', async () => {
    const { server } = startExampleServer();
    expect((await fetch(new URL('api/profiles/P9/stream', server.url), { headers: TOKEN_HEADERS })).status).toBe(404);
    expect((await fetch(new URL('api/profiles/P9/stream', server.url))).status).toBe(401);
  });
});

describe('the answers the Hephaestus clients read', () => {
  const RECORDED_PROCESS_ID = 4242;
  const INSTALL_HELD_TEXT = 'The install version changed, so launches are held until the board is updated.';

  test('A1: each route a client calls answers, and each refusal refuses, as recorded under the record command', async () => {
    const installHeldAnswer = {
      status: 423,
      body:   {
        controlVersion: 3, refusal: 'launches-held-by-install-change', fields: {}, text: INSTALL_HELD_TEXT
      }
    };
    const { server } = startExampleServer({ command: async () => installHeldAnswer }, RECORDED_PROCESS_ID);
    const replacements: [string, string][] = [[String(server.port), HEPHAESTUS_PLACEHOLDERS.PORT], [TOKEN, HEPHAESTUS_PLACEHOLDERS.TOKEN]];
    const recordedAs = async (callShape: string, response: Promise<Response>, expectedStatus: number): Promise<Response> => {
      const answered = await response;
      expect(answered.status, callShape).toBe(expectedStatus);
      recordAnswer(callShape, await recordedHttpResponseOf(answered.clone(), replacements));
      return answered;
    };
    const at = (path: string) => new URL(path, server.url);

    await recordedAs(HEPHAESTUS_CALL_SHAPES.IDENTITY, fetch(at('api/identity')), 200);
    await recordedAs(HEPHAESTUS_CALL_SHAPES.STATE_NO_TOKEN, fetch(at('api/state')), 401);
    await recordedAs(HEPHAESTUS_CALL_SHAPES.STATE, fetch(at('api/state'), { headers: TOKEN_HEADERS }), 200);

    const command = (authorization: string) => fetch(at('api/commands'), { method: 'POST', headers: { authorization }, body: JSON.stringify({ kind: 'hephaestus-pause' }) });
    await recordedAs(HEPHAESTUS_CALL_SHAPES.COMMAND_WITH_ANOTHER_TOKEN, command('Bearer another-token'), 401);
    await recordedAs(HEPHAESTUS_CALL_SHAPES.COMMAND_INSTALL_HELD, command(TOKEN_HEADERS.authorization), 423);
    const pictureUpload = fetch(at('api/pictures'), { method: 'POST', headers: { authorization: 'Bearer another-token' }, body: EXAMPLE_PICTURE_BYTES });
    await recordedAs(HEPHAESTUS_CALL_SHAPES.PICTURE_WITH_ANOTHER_TOKEN, pictureUpload, 401);
    await recordedAs(HEPHAESTUS_CALL_SHAPES.NUDGE, fetch(at('api/nudge'), { method: 'POST' }), 200);
    await recordedAs(HEPHAESTUS_CALL_SHAPES.FOREIGN_HOST, fetch(at('api/identity'), { headers: { host: `example.com:${server.port}` } }), 403);
    await recordedAs(HEPHAESTUS_CALL_SHAPES.FOREIGN_ORIGIN, fetch(at('api/identity'), { headers: { origin: 'http://example.com' } }), 403);

    let portRefusal: unknown = null;
    try {
      HephaestusServer.start({
        portChoice: { kind: 'given', port: server.port },
        identity:   {
          trackerId: EXAMPLE_TRACKER_ID, project: 'Example Agency', codeVersion: 'code-example', installVersion: 17, processId: RECORDED_PROCESS_ID
        },
        // The bind fails before any route is asked.
        routes: { token: () => TOKEN } as unknown as HephaestusRoutes,
      });
    } catch (error) {
      portRefusal = error;
    }
    expect(portRefusal).toBeInstanceOf(OperationRefusal);
    const { status, detail } = portRefusal as OperationRefusal;
    const recordedDetail = Object.fromEntries(Object.entries(detail ?? {}).map(([field, value]) => [field, value === server.port ? HEPHAESTUS_PLACEHOLDERS.PORT : value]));
    const recordedPortRefusal: RecordedPortRefusal = { status, detail: recordedDetail };
    recordAnswer(HEPHAESTUS_CALL_SHAPES.PORT_TAKEN, recordedPortRefusal);

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
    recordAnswer(HEPHAESTUS_CALL_SHAPES.NOTHING_LISTENS, recordedFailure);
  });
});
