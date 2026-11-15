/**
 * The real-system spec of overseer-fetch against programs that are no forge, run only by `bun run record overseer-fetch-other-programs`.
 * Each is a local Bun server on the port a registry entry names, and the boundary's real `fetch` records what it answers: a web page on
 * every route Gaia asks, and a stream that sends an event no snapshot can be read from, or ends inside an event. No forge sends these, and a
 * forge cannot be brought to; the Bun that serves them stamps the recording.
 */
import {
  afterEach,
  describe,
  expect,
  test
} from 'bun:test';

import { recordAnswer }        from '../../testing/BoundaryRecordings.ts';
import {
  requestCallShapeOf,
  situationCallShapeOf,
  streamCallShapeOf,
  type OverseerSituation,
  type RecordedStreamAnswer,
} from '../../testing/RecordedAnswers.ts';

import {
  realOverseerFetch,
  type OverseerAnswer,
  type OverseerRequest,
  type OverseerStream,
  type OverseerStreamRequest,
} from './OverseerFetch.ts';

const RECORDING_NAME = 'overseer-fetch-other-programs';
const GENEROUS_BOUND_MILLISECONDS = 10_000;
const EXAMPLE_TOKEN = 'example-token';
const WEB_PAGE = '<!doctype html><title>Example Agency</title>';
const WHOLE_SNAPSHOT = JSON.stringify({ monitorVersion: 1, trackerId: 'example-storefront-7c41', project: 'Example Storefront' });

const servers: Bun.Server<undefined>[] = [];

afterEach(async () => {
  for (const server of servers.splice(0)) await server.stop(true);
});

function serverAnswering(fetch: () => Response): string {
  const server = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch });
  servers.push(server);
  return server.url.href;
}

function monitorEventOf(data: string): string {
  return `event: monitor\ndata: ${data}\n\n`;
}

/** A stream that sends `texts`, one chunk each, then ends. */
function eventStreamOf(texts: readonly string[]): Response {
  const encoder = new TextEncoder();
  return new Response(new ReadableStream({
    start: (controller) => {
      for (const text of texts) controller.enqueue(encoder.encode(text));
      controller.close();
    },
  }), { headers: { 'Content-Type': 'text/event-stream' } });
}

function requestOf(overseerUrl: string, method: OverseerRequest['method'], path: string, bearerToken: string | null): OverseerRequest {
  return {
    overseerUrl, method, path, bearerToken, jsonBody: method === 'POST' ? '{"kind":"overseer-pause"}' : null, timeoutMilliseconds: GENEROUS_BOUND_MILLISECONDS,
  };
}

function streamRequestOf(overseerUrl: string): OverseerStreamRequest {
  return {
    overseerUrl, path: '/api/monitor/events', bearerToken: EXAMPLE_TOKEN, timeoutMilliseconds: GENEROUS_BOUND_MILLISECONDS,
  };
}

async function streamAnswerUntilTheEnd(stream: OverseerStream): Promise<RecordedStreamAnswer> {
  const chunks: string[] = [];
  for (;;) {
    const chunk = await stream.nextChunk();
    if (chunk.kind === 'ended') return { verdict: 'streaming', chunks, ending: chunk.ending };
    chunks.push(chunk.text);
  }
}

async function recordStream(situation: OverseerSituation, overseerUrl: string): Promise<RecordedStreamAnswer | OverseerAnswer> {
  const opening = await realOverseerFetch().openStream(streamRequestOf(overseerUrl));
  const answer  = opening.verdict === 'streaming' ? await streamAnswerUntilTheEnd(opening.stream) : opening;
  recordAnswer(RECORDING_NAME, situationCallShapeOf(situation, streamCallShapeOf(streamRequestOf(overseerUrl))), answer);
  return answer;
}

describe('another program on the Overseer\'s port', () => {
  test('answers its web page to every request and stream Gaia sends a forge', async () => {
    const overseerUrl = serverAnswering(() => new Response(WEB_PAGE, { headers: { 'Content-Type': 'text/html' } }));
    const requests = [
      requestOf(overseerUrl, 'GET', '/api/identity', null),
      requestOf(overseerUrl, 'GET', '/api/summary', null),
      requestOf(overseerUrl, 'GET', '/api/monitor', EXAMPLE_TOKEN),
      requestOf(overseerUrl, 'POST', '/api/commands', EXAMPLE_TOKEN),
      requestOf(overseerUrl, 'POST', '/api/session-codes', EXAMPLE_TOKEN),
    ];
    for (const pageRequest of requests) {
      const answer = await realOverseerFetch().request(pageRequest);
      expect(answer).toEqual({ verdict: 'answered', status: 200, bodyText: WEB_PAGE });
      recordAnswer(RECORDING_NAME, situationCallShapeOf('port-held-by-another-program', requestCallShapeOf(pageRequest)), answer);
    }
    expect(await recordStream('port-held-by-another-program', overseerUrl)).toEqual({ verdict: 'answered', status: 200, bodyText: WEB_PAGE });
  });
});

describe('an event stream that is not a forge\'s', () => {
  test('sends an event no snapshot can be read from, then a whole one, and ends', async () => {
    const overseerUrl = serverAnswering(() => eventStreamOf([monitorEventOf('{"monitorVersion":1,"trackerId"'), monitorEventOf(WHOLE_SNAPSHOT)]));
    expect(await recordStream('snapshot-unreadable', overseerUrl)).toMatchObject({ verdict: 'streaming', ending: 'closed' });
  });

  test('sends a whole event, then ends inside the next', async () => {
    const overseerUrl = serverAnswering(() => eventStreamOf([monitorEventOf(WHOLE_SNAPSHOT), `event: monitor\ndata: ${WHOLE_SNAPSHOT.slice(0, WHOLE_SNAPSHOT.length / 2)}`]));
    expect(await recordStream('stream-cut-inside-event', overseerUrl)).toMatchObject({ verdict: 'streaming', ending: 'closed' });
  });
});
