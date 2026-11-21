/**
 * The picture upload's body read, the gate profile stream route, the system versions and the versioned paths, on requests built in memory:
 * no server listens. What matters: a declared length over the limit is refused before one byte is read, and a body with no declared length
 * stops being read once it runs past the limit, so an oversized upload never costs its whole size in memory; a body within the limit is
 * read whole, its chunks in order. A profile stream sends each output line after its cursor, then each line appended later, as SSE with the
 * line number as the id; a run the routes do not know is a 404; the board event stream carries no output line; and every stream route has
 * Bun's idle timeout off. `GET /api/versions` answers while the Overseer starts and while it serves, with no token, behind the Host guard;
 * every endpoint the registry serves answers at its versioned path exactly as at its unversioned one, behind the same guards, and a version
 * or an endpoint the registry does not serve is a 404. Presence and the crash log answer behind the token at both paths, the crash log's
 * number reaching its route from the query. The board document answers at v1 behind the token with the assembly's document, while the
 * internal state answers as before at no versioned path. A templated endpoint, a job's or a profile's stream or a picture, answers at the
 * concrete path its template matches, and a path one segment longer is a 404. Each of the three board streams opens with the handshake,
 * which carries no id, so a reconnect at the versioned path replays from its `Last-Event-ID` as at the unversioned one. The Overseer
 * serves no page: `GET /` and every other path outside `/api/` is a 404. The bearer token is the only credential: the routes that once
 * gave a browser a session are a 404, and a data route answers a cookie with no token 401. Every answer carries the API's policy, which
 * lets nothing frame it, and a picture and a job file their sandbox.
 */
import {
  afterEach,
  describe,
  expect,
  test
} from 'bun:test';

import { FORGE_COMPATIBILITY_REGISTRY } from 'forge-contracts/ForgeCompatibilityRegistry';
import { FORGE_SYSTEM_VERSIONS }        from 'forge-contracts/ForgeSystemVersions';
import { CompatibilityRegistryUtil }    from 'system-versions/CompatibilityRegistryUtil';
import type { VersionsDocument }        from 'system-versions/VersionsDocument';

import type { MonitorSnapshot }                                             from '../../shared/monitor/@types/MonitorSnapshot.ts';
import { BoardDocumentAssembly }                                            from './BoardDocumentAssembly.ts';
import type { BoardState }                                                  from './BoardState.ts';
import { EventBroker }                                                      from './EventBroker.ts';
import type { GateProfileOutputLine }                                       from './GateProfiling.ts';
import { MonitorStream }                                                    from './MonitorStream.ts';
import { OverseerServer, type OverseerRequestHandler, type OverseerRoutes } from './OverseerServer.ts';
import { boardDocumentSourceFixture }                                       from './testing/BoardStateFixture.ts';

const EXAMPLE_UPLOAD_URL = 'http://127.0.0.1:4100/api/pictures';
const SIZE_LIMIT_BYTES = 8;

/** A streamed body of the chunks, counting how many the reader pulled. */
function countingBodyOf(chunks: readonly number[][]): { body: ReadableStream<Uint8Array>; pulledChunks: () => number } {
  let pulled = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      const chunk = chunks[pulled];
      if (chunk === undefined) {
        controller.close();
        return;
      }
      pulled += 1;
      controller.enqueue(Uint8Array.from(chunk));
    },
  }, { highWaterMark: 0 });
  return { body, pulledChunks: () => pulled };
}

describe('the picture upload body', () => {
  test('a declared length over the limit is refused with that length, and nothing of the body is read', async () => {
    const { body, pulledChunks } = countingBodyOf([[1, 2, 3, 4, 5, 6, 7, 8, 9]]);
    const request = new Request(EXAMPLE_UPLOAD_URL, { method: 'POST', headers: { 'content-length': '9' }, body });
    expect(await OverseerServer.boundedBodyOf(request, SIZE_LIMIT_BYTES)).toEqual({ verdict: 'over-limit', bytes: 9 });
    expect(pulledChunks()).toBe(0);
  });

  test('a body with no declared length stops being read at the chunk that runs past the limit', async () => {
    const { body, pulledChunks } = countingBodyOf([[1, 2, 3, 4, 5], [6, 7, 8, 9, 10], [11, 12, 13, 14, 15]]);
    const request = new Request(EXAMPLE_UPLOAD_URL, { method: 'POST', body });
    expect(await OverseerServer.boundedBodyOf(request, SIZE_LIMIT_BYTES)).toEqual({ verdict: 'over-limit', bytes: 10 });
    expect(pulledChunks()).toBe(2);
  });

  test('a body within the limit is read whole, its chunks in order', async () => {
    const { body } = countingBodyOf([[1, 2, 3], [4, 5, 6, 7, 8]]);
    const request = new Request(EXAMPLE_UPLOAD_URL, { method: 'POST', body });
    const upload = await OverseerServer.boundedBodyOf(request, SIZE_LIMIT_BYTES);
    expect(upload.verdict).toBe('read');
    expect(upload.verdict === 'read' ? [...upload.bytes] : []).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });
});

const EXAMPLE_API_ORIGIN = 'http://127.0.0.1:4100';
// Long enough that no ping lands in a case; the profile output is read on its own, short schedule.
const QUIET_HEARTBEAT_MILLISECONDS = 60_000;
const SHORT_FOLLOW_MILLISECONDS = 5;

const HANDSHAKE_TEXT = `event: handshake\ndata: ${JSON.stringify({ systemVersion: FORGE_SYSTEM_VERSIONS.current })}\n\n`;

const eventStreams = OverseerServer.eventStreamsOf({ heartbeatMilliseconds: QUIET_HEARTBEAT_MILLISECONDS, followMilliseconds: SHORT_FOLLOW_MILLISECONDS });

afterEach(() => {
  for (const close of [...eventStreams.open]) close();
});

function exampleState(ticketCount: number): BoardState {
  return {
    ticketCount,
    page:        { payload: { generatedAtEpochMilliseconds: 1 }, tickets: [] },
    jobs:        [],
    endedJobs:   [],
    decisions:   [],
    incidents:   [],
    notices:     [],
    mergeQueue:  { queuedTicketIds: [], slots: [] },
    overseer:    { state: 'serving', paused: false },
    usage:       { resetsAt: null, window: null, windows: [] },
    profileRuns: [],
  } as unknown as BoardState;
}

/** Routes that answer only what the stream routes ask; every other route is never called in these cases. */
function streamRoutesOf(broker: EventBroker, profileOutputOf: OverseerRoutes['profileOutputOf']): OverseerRoutes {
  const neverCalled = (): never => {
    throw new Error('a route the stream cases never call');
  };
  return {
    token:         () => null,
    started:       () => true,
    command:       neverCalled,
    onNudge:       neverCalled,
    state:         neverCalled,
    board:         neverCalled,
    summary:       neverCalled,
    monitor:       neverCalled,
    presence:      neverCalled,
    crashLog:      neverCalled,
    monitorStream: () => null,
    refusalTextOf: neverCalled,
    events:        () => broker,
    transcriptOf:  () => null,
    profileOutputOf,
    jobFileText:   () => null,
    storePicture:  neverCalled,
    picture:       () => null,
  };
}

function answerOf(routes: OverseerRoutes, path: string, headers: Record<string, string> = {}): Response {
  const request = new Request(new URL(path, EXAMPLE_API_ORIGIN).href, { headers });
  const route = OverseerServer.dataRouteOf(request, routes, eventStreams, FORGE_SYSTEM_VERSIONS.current);
  if (route === null) throw new Error(`no data route for ${path}`);
  return route();
}

/** Reads a stream until its text satisfies `isComplete`; `whenFirstRead` runs on its first chunk, once the stream is following. */
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

describe('the gate profile stream', () => {
  test('sends each line after the cursor, then each appended line, as a line event whose id is the line number', async () => {
    const pending: GateProfileOutputLine[] = [{ lineNumber: 3, text: 'third' }];
    const asked: [string, string | null][] = [];
    const routes = streamRoutesOf(EventBroker.createEventBroker(1), (profileRunId, after) => {
      asked.push([profileRunId, after]);
      return () => pending.splice(0);
    });
    const response = answerOf(routes, '/api/profiles/P4/stream?after=9', { 'last-event-id': '2' });
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('text/event-stream');
    const text = await streamTextUntil(response, (soFar) => soFar.includes('id: 4\n'), { whenFirstRead: () => pending.push({ lineNumber: 4, text: 'fourth "quoted"' }), });
    expect(text).toBe(`${HANDSHAKE_TEXT}id: 3\nevent: line\ndata: {"text":"third"}\n\nid: 4\nevent: line\ndata: {"text":"fourth \\"quoted\\""}\n\n`);
    expect(asked).toEqual([['P4', '2']]);
  });

  test('takes the after parameter when no Last-Event-ID is sent', () => {
    const asked: (string | null)[] = [];
    const routes = streamRoutesOf(EventBroker.createEventBroker(1), (_profileRunId, after) => {
      asked.push(after);
      return () => [];
    });
    answerOf(routes, '/api/profiles/P1/stream?after=7');
    answerOf(routes, '/api/profiles/P1/stream');
    expect(asked).toEqual(['7', null]);
  });

  test('a run the routes do not know is a 404 not-found, and nothing is streamed', async () => {
    const routes = streamRoutesOf(EventBroker.createEventBroker(1), () => null);
    const response = answerOf(routes, '/api/profiles/P9/stream');
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ refusal: 'not-found' });
    expect(eventStreams.open.size).toBe(0);
  });

  test('the board event stream carries no output line, and a board event reaches no profile stream', async () => {
    const broker = EventBroker.createEventBroker(1);
    broker.publishState(exampleState(1));
    const pending: GateProfileOutputLine[] = [];
    const routes = streamRoutesOf(broker, () => () => pending.splice(0));
    const boardStream = answerOf(routes, '/api/events');
    const profileStream = answerOf(routes, '/api/profiles/P1/stream');
    pending.push({ lineNumber: 1, text: 'gate output' });
    broker.publishState(exampleState(2));
    const profileText = await streamTextUntil(profileStream, (soFar) => soFar.includes('id: 1\n'));
    expect(profileText).toBe(`${HANDSHAKE_TEXT}id: 1\nevent: line\ndata: {"text":"gate output"}\n\n`);
    const boardText = await streamTextUntil(boardStream, (soFar) => soFar.includes('id: 1-2\n'));
    expect(boardText).toContain('event: board');
    expect(boardText).not.toContain('event: line');
    expect(boardText).not.toContain('gate output');
    const replay = broker.replayAfter('1-1');
    expect(replay.verdict === 'replayed' ? replay.events.map((event) => event.kind) : []).toEqual(['board']);
  });

  test('every stream route has Bun\'s idle timeout off, and no other route does', () => {
    expect(['/api/events', '/api/jobs/J1/stream', '/api/profiles/P1/stream'].map(OverseerServer.pathIsStream)).toEqual([true, true, true]);
    expect(['/api/state', '/api/profiles/P1', '/api/jobs/J1/files/gate.log'].map(OverseerServer.pathIsStream)).toEqual([false, false, false]);
  });
});

const PORT = 4100;
const TOKEN = 'example-token';
const HOST_HEADERS = { host: `127.0.0.1:${PORT}` };
const TOKEN_HEADERS = { ...HOST_HEADERS, authorization: `Bearer ${TOKEN}` };
const VERSIONED_ENDPOINTS = [
  'identity',
  'summary',
  'monitor',
  'monitor/events',
  'commands',
  'presence',
  'crash-log',
  'board',
  'events',
  'jobs/{jobId}/stream',
  'profiles/{profileRunId}/stream',
  'pictures',
  'pictures/{pictureId}',
];
const EXAMPLE_PICTURE_ID = 'a'.repeat(64);

const openHandlers: OverseerRequestHandler[] = [];

afterEach(() => {
  for (const handler of openHandlers.splice(0)) handler.closeEveryStream();
});

const BOARD_DOCUMENT_SOURCE = boardDocumentSourceFixture();

const BOARD_STATE = BOARD_DOCUMENT_SOURCE.state;

/** Routes that answer each versioned endpoint with a fixed body, so an answer shows which route gave it. */
function versionedRoutesOf(started: () => boolean): OverseerRoutes {
  const monitorStream = MonitorStream.createMonitorStream();
  monitorStream.publish({ monitorVersion: 4, openIncidents: 0 } as unknown as MonitorSnapshot);
  const broker = EventBroker.createEventBroker(1);
  broker.publishState(exampleState(1));
  broker.publishState(exampleState(2));
  return {
    token:         () => TOKEN,
    started,
    command:       (body) => Promise.resolve({ status: 200, body: { controlVersion: 2, received: body } }),
    summary:       () => ({ summaryVersion: 1, project: 'Example Agency' }),
    monitor:       () => ({ status: 200, body: { monitorVersion: 4 } }),
    presence:      () => ({ status: 200, body: { generation: 4 } }),
    crashLog:      (writtenNumber) => ({ status: 200, body: { number: writtenNumber } }),
    state:         () => BOARD_STATE,
    board:         () => BoardDocumentAssembly.boardDocumentOf(BOARD_DOCUMENT_SOURCE),
    monitorStream: () => monitorStream,
    refusalTextOf: (refusal) => `Example sentence for ${refusal}`,
    jobFileText:   (jobId, fileName) => (jobId === 'J1' && fileName === 'report.json' ? 'example report' : null),
    events:        () => broker,
    transcriptOf:  (jobId, after) => (jobId === 'J1' ? () => [{
      cursor: '1.1', role: 'assistant', text: `after ${after ?? 'nothing'}`, entryKey: '1.1.0', at: null
    }] : null),
    profileOutputOf: (profileRunId, after) => (profileRunId === 'P1' ? () => [{ lineNumber: 1, text: `after ${after ?? 'nothing'}` }] : null),
    storePicture:    (upload) => ({ status: 200, body: { stored: upload.verdict === 'read' ? upload.bytes.length : null } }),
    picture:         (pictureId) => (pictureId === EXAMPLE_PICTURE_ID ? { mediaType: 'image/png', bytes: Uint8Array.from([1, 2, 3]) } : null),
  } as Partial<OverseerRoutes> as OverseerRoutes;
}

function versionedHandlerOf({ started = () => true, versions }: { started?: () => boolean; versions?: VersionsDocument } = {}): OverseerRequestHandler {
  const handler = OverseerServer.requestHandlerOf({
    portChoice: { kind: 'given', port: PORT },
    identity:   {
      trackerId: 'tracker-example', project: 'Example Agency', codeVersion: 'code-example', installVersion: 17, processId: 4242
    },
    routes:                versionedRoutesOf(started),
    heartbeatMilliseconds: QUIET_HEARTBEAT_MILLISECONDS,
    ...(versions === undefined ? {} : { versions }),
  });
  openHandlers.push(handler);
  return handler;
}

function requestTo(path: string, { method = 'GET', headers = TOKEN_HEADERS, body }: { method?: string; headers?: Record<string, string>; body?: unknown } = {}): Request {
  return new Request(`${EXAMPLE_API_ORIGIN}${path}`, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}

/** A stream's text up to its first event after the handshake. */
async function streamOpeningOf(response: Response): Promise<string> {
  return await streamTextUntil(response, (soFar) => soFar.split('\n\n').length > 2);
}

/** The status, and the body read as JSON or as bytes, or a stream's opening. */
async function answerFactsOf(response: Response): Promise<[number, unknown]> {
  const contentType = response.headers.get('content-type') ?? '';
  if (contentType === 'text/event-stream') return [response.status, await streamOpeningOf(response)];
  if (contentType.startsWith('application/json')) return [response.status, await response.json()];
  return [response.status, [...new Uint8Array(await response.arrayBuffer())]];
}

function servedPathOf(endpoint: string, values: Readonly<Record<string, string>> = {}): string {
  const version = CompatibilityRegistryUtil.endpointVersionAt(FORGE_COMPATIBILITY_REGISTRY, endpoint, FORGE_SYSTEM_VERSIONS.current);
  return `/api/v${version}/${CompatibilityRegistryUtil.endpointPathOf(endpoint, values)}`;
}

describe('GET /api/versions', () => {
  test('answers the forge\'s system versions with no token, while the Overseer starts and while it serves', async () => {
    let started = false;
    const handler = versionedHandlerOf({ started: () => started });
    const whileStarting = await handler.answer(requestTo('/api/versions', { headers: HOST_HEADERS }), PORT);
    expect([whileStarting.status, await whileStarting.json()]).toEqual([200, FORGE_SYSTEM_VERSIONS]);
    expect((await handler.answer(requestTo('/api/identity', { headers: HOST_HEADERS }), PORT)).status).toBe(503);
    started = true;
    const whileServing = await handler.answer(requestTo('/api/versions', { headers: HOST_HEADERS }), PORT);
    expect([whileServing.status, await whileServing.json()]).toEqual([200, FORGE_SYSTEM_VERSIONS]);
  });

  test('answers the versions a client\'s recording sets in their place', async () => {
    const versions = { current: { major: 2, minor: 1 }, minimumSupported: { major: 2, minor: 0 } };
    const answer = await versionedHandlerOf({ versions }).answer(requestTo('/api/versions', { headers: HOST_HEADERS }), PORT);
    expect(await answer.json()).toEqual(versions);
  });

  test('is refused 403 for a foreign Host, like every route, and is never versioned itself', async () => {
    const handler = versionedHandlerOf();
    const foreign = await handler.answer(requestTo('/api/versions', { headers: { host: `example.com:${PORT}` } }), PORT);
    expect([foreign.status, await foreign.json()]).toEqual([403, { refusal: 'forbidden', text: 'Example sentence for forbidden' }]);
    const versioned = await handler.answer(requestTo('/api/v1/versions', { headers: HOST_HEADERS }), PORT);
    expect([versioned.status, await versioned.json()]).toEqual([404, { refusal: 'not-found' }]);
  });
});

describe('the versioned paths', () => {
  test('the registry versions exactly the endpoints these cases call', () => {
    expect(FORGE_COMPATIBILITY_REGISTRY.flatMap((entry) => (entry.kind === 'endpoint' ? [entry.endpoint] : []))).toEqual(VERSIONED_ENDPOINTS);
  });

  test('every endpoint answers at the version the registry serves exactly as at its unversioned path', async () => {
    const calls: { endpoint: string; values?: Record<string, string>; method?: string; body?: unknown }[] = [
      { endpoint: 'identity' },
      { endpoint: 'summary' },
      { endpoint: 'monitor' },
      { endpoint: 'monitor/events' },
      { endpoint: 'commands', method: 'POST', body: { kind: 'overseer-pause' } },
      { endpoint: 'presence' },
      { endpoint: 'crash-log' },
      { endpoint: 'board' },
      { endpoint: 'events' },
      { endpoint: 'jobs/{jobId}/stream', values: { jobId: 'J1' } },
      { endpoint: 'profiles/{profileRunId}/stream', values: { profileRunId: 'P1' } },
      { endpoint: 'pictures', method: 'POST', body: [1, 2, 3] },
      { endpoint: 'pictures/{pictureId}', values: { pictureId: EXAMPLE_PICTURE_ID } },
    ];
    for (const {
      endpoint, values = {}, method, body
    } of calls) {
      const options = { ...(method === undefined ? {} : { method }), ...(body === undefined ? {} : { body }) };
      const concretePath = CompatibilityRegistryUtil.endpointPathOf(endpoint, values);
      const unversioned = await answerFactsOf(await versionedHandlerOf().answer(requestTo(`/api/${concretePath}`, options), PORT));
      const versioned = await answerFactsOf(await versionedHandlerOf().answer(requestTo(servedPathOf(endpoint, values), options), PORT));
      expect(versioned, endpoint).toEqual(unversioned);
      expect(unversioned[0], endpoint).toBe(200);
    }
  });

  test('keeps the unversioned route\'s guards: no token is a 401, and every answer carries the API\'s policy', async () => {
    const refused = await versionedHandlerOf().answer(requestTo(servedPathOf('monitor'), { headers: HOST_HEADERS }), PORT);
    expect([refused.status, await refused.json()]).toEqual([401, { refusal: 'unauthorized', text: 'Example sentence for unauthorized' }]);
    expect(refused.headers.get('content-security-policy')).toBe(OverseerServer.API_CONTENT_SECURITY_POLICY);
  });

  test('no path outside the API answers a page: the root, an index file and a chunk are each a 404 not-found', async () => {
    const handler = versionedHandlerOf();
    for (const path of ['/', '/index.html', '/chunk-abc.js']) {
      const answer = await handler.answer(requestTo(path), PORT);
      expect([answer.status, await answer.json()], path).toEqual([404, { refusal: 'not-found' }]);
    }
  });

  test('holds a versioned stream open, as its unversioned path', async () => {
    let heldOpen = false;
    await versionedHandlerOf().answer(requestTo(servedPathOf('monitor/events')), PORT, () => {
      heldOpen = true;
    });
    expect(heldOpen).toBe(true);
  });

  test('a version or an endpoint the registry does not serve is a 404 not-found', async () => {
    const handler = versionedHandlerOf();
    const unservedPaths = [
      '/api/v9/identity',
      '/api/v1/monitor',
      '/api/v0/summary',
      '/api/v01/summary',
      '/api/v1/state',
      '/api/v1/events',
      '/api/v3/events',
      '/api/v2/',
      '/api/v1/jobs/J1/extra',
      '/api/v1/jobs/J1/stream/extra',
      '/api/v1/jobs//stream',
      '/api/v1/jobs/J%201/stream',
      '/api/v1/profiles/P1',
      '/api/v1/jobs/J1/files/report.json',
    ];
    for (const path of unservedPaths) {
      const answer = await handler.answer(requestTo(path), PORT);
      expect([answer.status, await answer.json()], path).toEqual([404, { refusal: 'not-found' }]);
    }
  });
});

describe('presence and the crash log', () => {
  test('each answers 401 without the token and its document with it, at its unversioned and its v1 path, the query kept', async () => {
    const handler = versionedHandlerOf();
    const answers: [string, unknown][] = [
      ['/api/presence', { generation: 4 }],
      ['/api/v1/presence', { generation: 4 }],
      ['/api/crash-log', { number: null }],
      ['/api/v1/crash-log?number=2', { number: '2' }],
    ];
    for (const [path, document] of answers) {
      const refused = await handler.answer(requestTo(path, { headers: HOST_HEADERS }), PORT);
      expect([refused.status, await refused.json()], path).toEqual([401, { refusal: 'unauthorized', text: 'Example sentence for unauthorized' }]);
      const answered = await handler.answer(requestTo(path), PORT);
      expect([answered.status, await answered.json()], path).toEqual([200, document]);
    }
  });

  test('a version the registry does not serve them at is a 404 not-found', async () => {
    const handler = versionedHandlerOf();
    for (const path of ['/api/v2/presence', '/api/v2/crash-log?number=1']) {
      const answer = await handler.answer(requestTo(path), PORT);
      expect([answer.status, await answer.json()], path).toEqual([404, { refusal: 'not-found' }]);
    }
  });
});

describe('the board document', () => {
  test('answers GET /api/v2/board with the token by the assembly\'s document, and 401 unauthorized without it', async () => {
    const handler = versionedHandlerOf();
    const answered = await handler.answer(requestTo('/api/v2/board'), PORT);
    expect([answered.status, await answered.json()]).toEqual([200, JSON.parse(JSON.stringify(BoardDocumentAssembly.boardDocumentOf(BOARD_DOCUMENT_SOURCE)))]);
    const refused = await handler.answer(requestTo('/api/v2/board', { headers: HOST_HEADERS }), PORT);
    expect([refused.status, await refused.json()]).toEqual([401, { refusal: 'unauthorized', text: 'Example sentence for unauthorized' }]);
  });

  test('a version the registry does not serve it at is a 404 not-found, the version forge 1 served it at among them', async () => {
    for (const path of ['/api/v1/board', '/api/v3/board']) {
      const answer = await versionedHandlerOf().answer(requestTo(path), PORT);
      expect([path, answer.status, await answer.json()]).toEqual([path, 404, { refusal: 'not-found' }]);
    }
  });

  test('GET /api/state answers the state as before, at no versioned path', async () => {
    const handler = versionedHandlerOf();
    const state = await handler.answer(requestTo('/api/state'), PORT);
    expect([state.status, await state.json()]).toEqual([200, JSON.parse(JSON.stringify(BOARD_STATE))]);
    expect((await handler.answer(requestTo('/api/v1/state'), PORT)).status).toBe(404);
  });
});

describe('the board streams at their versioned paths', () => {
  test('a job\'s and a profile\'s stream reach their routes with the id from the path', async () => {
    const handler = versionedHandlerOf();
    const jobStream = await streamOpeningOf(await handler.answer(requestTo('/api/v1/jobs/J1/stream?after=0.9'), PORT));
    expect(jobStream).toContain('"text":"after 0.9"');
    const profileStream = await streamOpeningOf(await handler.answer(requestTo('/api/v1/profiles/P1/stream?after=4'), PORT));
    expect(profileStream).toContain('{"text":"after 4"}');
    const unknownJob = await handler.answer(requestTo('/api/v1/jobs/J9/stream'), PORT);
    expect([unknownJob.status, await unknownJob.json()]).toEqual([404, { refusal: 'not-found' }]);
  });

  test('each of the three streams writes the handshake with no id before any other event', async () => {
    const handler = versionedHandlerOf();
    for (const path of ['/api/v2/events', '/api/v1/jobs/J1/stream', '/api/v1/profiles/P1/stream']) {
      const opening = await streamOpeningOf(await handler.answer(requestTo(path), PORT));
      expect(opening, path).toStartWith(HANDSHAKE_TEXT);
      expect(opening.slice(HANDSHAKE_TEXT.length), path).toStartWith('id: ');
    }
  });

  test('a Last-Event-ID replay at /api/v2/events sends what was missed, as at /api/events', async () => {
    const replayedAt = async (path: string): Promise<string[] | null> => {
      const text = await streamOpeningOf(await versionedHandlerOf().answer(requestTo(path, { headers: { ...TOKEN_HEADERS, 'last-event-id': '1-1' } }), PORT));
      return text.match(/^id: .+$/gm);
    };
    expect(await replayedAt('/api/v2/events')).toEqual(['id: 1-2']);
    expect(await replayedAt('/api/v2/events')).toEqual(await replayedAt('/api/events'));
  });
});

const DATA_ROUTE_PATHS = [
  '/api/state',
  '/api/board',
  '/api/events',
  '/api/monitor',
  '/api/monitor/events',
  '/api/presence',
  '/api/crash-log',
  '/api/jobs/J1/stream',
  '/api/jobs/J1/files/report.json',
  '/api/profiles/P1/stream',
  `/api/pictures/${EXAMPLE_PICTURE_ID}`,
];
/** A cookie named as a browser session of this server once was. */
const COOKIE_HEADERS = { ...HOST_HEADERS, cookie: `forge-session-${PORT}=example-secret` };

describe('the bearer token is the only credential', () => {
  test('the routes that gave a browser a session are each a 404, with the token and without', async () => {
    const handler = versionedHandlerOf();
    const calls: { path: string; method: string; body?: unknown }[] = [
      { path: '/api/session-codes', method: 'POST' },
      { path: '/api/v1/session-codes', method: 'POST' },
      { path: '/api/session', method: 'POST', body: { code: 'example-code' } },
      { path: '/api/session-token', method: 'GET' },
    ];
    for (const { path, method, body } of calls) {
      for (const headers of [TOKEN_HEADERS, HOST_HEADERS]) {
        const answer = await handler.answer(requestTo(path, { method, headers, ...(body === undefined ? {} : { body }) }), PORT);
        expect([answer.status, await answer.json()], `${method} ${path}`).toEqual([404, { refusal: 'not-found' }]);
        expect(answer.headers.get('set-cookie'), `${method} ${path}`).toBeNull();
      }
    }
  });

  test('the ask of Flint\'s brain, which no forge runs any more, is a 404 with the token and without', async () => {
    for (const headers of [TOKEN_HEADERS, HOST_HEADERS]) {
      const answer = await versionedHandlerOf().answer(requestTo('/api/flint-brain/ask', { method: 'POST', headers, body: { cues: [] } }), PORT);
      expect([answer.status, await answer.json()]).toEqual([404, { refusal: 'not-found' }]);
    }
  });

  test('every data route answers a cookie with no token 401 unauthorized, and its document to the token', async () => {
    for (const path of DATA_ROUTE_PATHS) {
      const byCookie = await versionedHandlerOf().answer(requestTo(path, { headers: COOKIE_HEADERS }), PORT);
      expect([byCookie.status, await byCookie.json()], path).toEqual([401, { refusal: 'unauthorized', text: 'Example sentence for unauthorized' }]);
      const byToken = await versionedHandlerOf().answer(requestTo(path), PORT);
      expect(byToken.status, path).toBe(200);
    }
  });
});

describe('the content security policy', () => {
  test('a JSON answer, a stream, a refusal and a 404 each carry the API\'s policy, whose only frame-ancestors source is \'none\'', async () => {
    expect(OverseerServer.API_CONTENT_SECURITY_POLICY).toBe('default-src \'none\'; frame-ancestors \'none\'; base-uri \'none\'; form-action \'none\'');
    const handler = versionedHandlerOf();
    const answers = [
      await handler.answer(requestTo('/api/versions', { headers: HOST_HEADERS }), PORT),
      await handler.answer(requestTo('/api/board'), PORT),
      await handler.answer(requestTo('/api/events'), PORT),
      await handler.answer(requestTo('/api/board', { headers: HOST_HEADERS }), PORT),
      await handler.answer(requestTo('/api/board', { headers: { host: `example.com:${PORT}` } }), PORT),
      await handler.answer(requestTo('/'), PORT),
      await handler.answer(requestTo('/api/v99/board'), PORT),
    ];
    expect(answers.map((answer) => answer.status)).toEqual([200, 200, 200, 401, 403, 404, 404]);
    for (const answer of answers) {
      const policy = answer.headers.get('content-security-policy') ?? '';
      expect(policy).toBe(OverseerServer.API_CONTENT_SECURITY_POLICY);
      expect(/frame-ancestors ([^;]*)/.exec(policy)?.[1]).toBe('\'none\'');
    }
  });

  test('a picture and a job file keep their sandbox', async () => {
    const handler = versionedHandlerOf();
    for (const path of [`/api/pictures/${EXAMPLE_PICTURE_ID}`, '/api/jobs/J1/files/report.json']) {
      const answer = await handler.answer(requestTo(path), PORT);
      expect([answer.status, answer.headers.get('content-security-policy')], path).toEqual([200, 'sandbox']);
    }
  });
});
