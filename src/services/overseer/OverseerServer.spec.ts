/**
 * The picture upload's body read and the gate profile stream route, on requests built in memory: no server listens. What matters: a
 * declared length over the limit is refused before one byte is read, and a body with no declared length stops being read once it runs past
 * the limit, so an oversized upload never costs its whole size in memory; a body within the limit is read whole, its chunks in order. A
 * profile stream sends each output line after its cursor, then each line appended later, as SSE with the line number as the id; a run the
 * routes do not know is a 404; the board event stream carries no output line; and every stream route has Bun's idle timeout off.
 */
import {
  afterEach,
  describe,
  expect,
  test
} from 'bun:test';

import type { BoardState }                     from './BoardState.ts';
import { EventBroker }                         from './EventBroker.ts';
import type { GateProfileOutputLine }          from './GateProfiling.ts';
import { OverseerServer, type OverseerRoutes } from './OverseerServer.ts';

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
    expect(await OverseerServer.pictureUploadOf(request, SIZE_LIMIT_BYTES)).toEqual({ verdict: 'over-limit', bytes: 9 });
    expect(pulledChunks()).toBe(0);
  });

  test('a body with no declared length stops being read at the chunk that runs past the limit', async () => {
    const { body, pulledChunks } = countingBodyOf([[1, 2, 3, 4, 5], [6, 7, 8, 9, 10], [11, 12, 13, 14, 15]]);
    const request = new Request(EXAMPLE_UPLOAD_URL, { method: 'POST', body });
    expect(await OverseerServer.pictureUploadOf(request, SIZE_LIMIT_BYTES)).toEqual({ verdict: 'over-limit', bytes: 10 });
    expect(pulledChunks()).toBe(2);
  });

  test('a body within the limit is read whole, its chunks in order', async () => {
    const { body } = countingBodyOf([[1, 2, 3], [4, 5, 6, 7, 8]]);
    const request = new Request(EXAMPLE_UPLOAD_URL, { method: 'POST', body });
    const upload = await OverseerServer.pictureUploadOf(request, SIZE_LIMIT_BYTES);
    expect(upload.verdict).toBe('read');
    expect(upload.verdict === 'read' ? [...upload.bytes] : []).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });
});

const EXAMPLE_API_ORIGIN = 'http://127.0.0.1:4100';
// Long enough that no ping lands in a case; the profile output is read on its own, short schedule.
const QUIET_HEARTBEAT_MILLISECONDS = 60_000;
const SHORT_FOLLOW_MILLISECONDS = 5;

const eventStreams = OverseerServer.eventStreamsOf({ heartbeatMilliseconds: QUIET_HEARTBEAT_MILLISECONDS, followMilliseconds: SHORT_FOLLOW_MILLISECONDS });

afterEach(() => {
  for (const close of [...eventStreams.open]) close();
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
    overseer:   { state: 'serving', paused: false },
    usage:      { resetsAt: null, window: null, windows: [] },
  } as unknown as BoardState;
}

/** Routes that answer only what the stream routes ask; every other route is never called in these cases. */
function streamRoutesOf(broker: EventBroker, profileOutputOf: OverseerRoutes['profileOutputOf']): OverseerRoutes {
  const neverCalled = (): never => {
    throw new Error('a route the stream cases never call');
  };
  return {
    token:        () => null,
    started:      () => true,
    command:      neverCalled,
    onNudge:      neverCalled,
    state:        neverCalled,
    summary:      neverCalled,
    events:       () => broker,
    transcriptOf: () => null,
    profileOutputOf,
    jobFileText:  () => null,
    storePicture: neverCalled,
    picture:      () => null,
    frameOrigins: () => [],
  };
}

function answerOf(routes: OverseerRoutes, path: string, headers: Record<string, string> = {}): Response {
  const route = OverseerServer.dataRouteOf(new Request(new URL(path, EXAMPLE_API_ORIGIN).href, { headers }), routes, eventStreams);
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
    expect(text).toBe('id: 3\nevent: line\ndata: {"text":"third"}\n\nid: 4\nevent: line\ndata: {"text":"fourth \\"quoted\\""}\n\n');
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
    expect(profileText).toBe('id: 1\nevent: line\ndata: {"text":"gate output"}\n\n');
    const boardText = await streamTextUntil(boardStream, (soFar) => soFar.includes('id: 1-2\n'));
    expect(boardText).toContain('event: board');
    expect(boardText).not.toContain('event: line');
    expect(boardText).not.toContain('gate output');
    const replay = broker.replayAfter('1-1');
    expect(replay.verdict === 'replayed' ? replay.events.map((event) => event.kind) : []).toEqual(['board']);
  });

  test('every stream route has Bun\'s idle timeout off, and no other route does', () => {
    expect(['/api/events', '/api/jobs/J1/stream', '/api/profiles/P1/stream'].map(OverseerServer.isStreamPath)).toEqual([true, true, true]);
    expect(['/api/state', '/api/profiles/P1', '/api/jobs/J1/files/gate.log'].map(OverseerServer.isStreamPath)).toEqual([false, false, false]);
  });
});
