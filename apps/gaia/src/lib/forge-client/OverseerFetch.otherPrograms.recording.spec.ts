/**
 * The real-system spec of overseer-fetch against local Bun servers, run only by `bun run record overseer-fetch-other-programs`. Programs
 * that are no forge, on the port a registry entry names, and the boundary's real `fetch` records what it answers at each path Gaia calls:
 * a web page on every route Gaia asks, `/api/versions` included, and a stream that sends an event no snapshot can be read from, or ends
 * inside an event. No forge sends these, and a forge cannot be brought to; the Bun that serves them stamps the recording. Local servers
 * prove the rest of the boundary against the real `fetch`, recording nothing: the bearer and the body it sends, a byte body and a byte
 * answer with their content types, a bound that runs out, and a stream, with its last event id, read until it ends, breaks or is closed.
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

import { ApiPathUtil } from '../api-paths/ApiPathUtil.ts';

import { forgeEndpointVersionOf } from './ForgeClient.ts';
import {
  realOverseerFetch,
  type OverseerAnswer,
  type OverseerRequest,
  type OverseerStream,
  type OverseerStreamAnswer,
  type OverseerStreamRequest,
} from './OverseerFetch.ts';

const RECORDING_NAME = 'overseer-fetch-other-programs';
const GENEROUS_BOUND_MILLISECONDS = 10_000;
const SHORT_BOUND_MILLISECONDS = 200;
const EXAMPLE_TOKEN = 'example-token';
const WRONG_TOKEN = 'example-token-of-another-overseer';
const UNAUTHORIZED_STATUS = 401;
const SUCCESS_STATUS = 200;
const WEB_PAGE = '<!doctype html><title>Example Agency</title>';
const WHOLE_SNAPSHOT = JSON.stringify({ monitorVersion: 1, trackerId: 'example-storefront-7c41', project: 'Example Storefront' });

/** The paths Gaia calls a forge at: the version forge's registry serves the supported forge version. */
const PATHS = {
  identity:      ApiPathUtil.versionedPathOf('identity', forgeEndpointVersionOf('identity')),
  summary:       ApiPathUtil.versionedPathOf('summary', forgeEndpointVersionOf('summary')),
  monitor:       ApiPathUtil.versionedPathOf('monitor', forgeEndpointVersionOf('monitor')),
  monitorEvents: ApiPathUtil.versionedPathOf('monitor/events', forgeEndpointVersionOf('monitorEvents')),
  commands:      ApiPathUtil.versionedPathOf('commands', forgeEndpointVersionOf('commands')),
} as const;

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

function requestOf(overseerUrl: string, method: OverseerRequest['method'], path: string, bearerToken: string | null, jsonBody: string | null = null): OverseerRequest {
  return {
    overseerUrl,
    method,
    path,
    bearerToken,
    jsonBody:            jsonBody ?? (method === 'POST' ? '{"kind":"overseer-pause"}' : null),
    byteBody:            null,
    answerAs:            'text',
    timeoutMilliseconds: GENEROUS_BOUND_MILLISECONDS,
  };
}

function streamRequestOf(overseerUrl: string, bearerToken = EXAMPLE_TOKEN, timeoutMilliseconds = GENEROUS_BOUND_MILLISECONDS): OverseerStreamRequest {
  return {
    overseerUrl, path: PATHS.monitorEvents, bearerToken, lastEventId: null, timeoutMilliseconds,
  };
}

function streamOf(answer: OverseerStreamAnswer): OverseerStream {
  if (answer.verdict !== 'streaming') throw new Error(`The stream answered ${JSON.stringify(answer)}`);
  return answer.stream;
}

async function textUntilTheEndOf(stream: OverseerStream): Promise<{ readonly text: string; readonly ending: string }> {
  let text  = '';
  let chunk = await stream.nextChunk();
  while (chunk.kind === 'text') {
    text += chunk.text;
    chunk = await stream.nextChunk();
  }
  return { text, ending: chunk.ending };
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
      requestOf(overseerUrl, 'GET', ApiPathUtil.VERSIONS_PATH, null),
      requestOf(overseerUrl, 'GET', PATHS.identity, null),
      requestOf(overseerUrl, 'GET', PATHS.summary, null),
      requestOf(overseerUrl, 'GET', PATHS.monitor, EXAMPLE_TOKEN),
      requestOf(overseerUrl, 'POST', PATHS.commands, EXAMPLE_TOKEN),
    ];
    for (const pageRequest of requests) {
      const answer = await realOverseerFetch().request(pageRequest);
      expect(answer).toMatchObject({ verdict: 'answered', status: 200, bodyText: WEB_PAGE });
      recordAnswer(RECORDING_NAME, situationCallShapeOf('port-held-by-another-program', requestCallShapeOf(pageRequest)), answer);
    }
    expect(await recordStream('port-held-by-another-program', overseerUrl)).toMatchObject({ verdict: 'answered', status: 200, bodyText: WEB_PAGE });
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

describe('a request', () => {
  test('sends the token as a bearer, and a JSON body with its content type', async () => {
    const seen: { authorization: string | null; contentType: string | null; body: string }[] = [];
    const server = Bun.serve({
      hostname: '127.0.0.1',
      port:     0,
      fetch:    async (request) => {
        seen.push({ authorization: request.headers.get('Authorization'), contentType: request.headers.get('Content-Type'), body: await request.text() });
        return Response.json({ outcome: 'done' });
      },
    });
    try {
      const answer = await realOverseerFetch().request(requestOf(server.url.href, 'POST', PATHS.commands, EXAMPLE_TOKEN, '{"kind":"overseer-pause"}'));
      expect(answer).toMatchObject({ verdict: 'answered', status: SUCCESS_STATUS, bodyText: '{"outcome":"done"}' });
      expect(seen).toEqual([{ authorization: `Bearer ${EXAMPLE_TOKEN}`, contentType: 'application/json', body: '{"kind":"overseer-pause"}' }]);
    } finally {
      await server.stop(true);
    }
  });

  test('sends a byte body with its media type, and keeps a byte answer\'s bytes and content type', async () => {
    const pictureBytes = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0xff]);
    const seen: { contentType: string | null; bytes: Uint8Array }[] = [];
    const server = Bun.serve({
      hostname: '127.0.0.1',
      port:     0,
      fetch:    async (request) => {
        seen.push({ contentType: request.headers.get('Content-Type'), bytes: new Uint8Array(await request.arrayBuffer()) });
        return new Response(pictureBytes, { headers: { 'Content-Type': 'image/png' } });
      },
    });
    try {
      const byteRequest: OverseerRequest = {
        ...requestOf(server.url.href, 'POST', PATHS.commands, EXAMPLE_TOKEN), jsonBody: null, byteBody: { bytes: pictureBytes, mediaType: 'image/png' }, answerAs: 'bytes',
      };
      expect(await realOverseerFetch().request(byteRequest)).toEqual({
        verdict: 'answered', status: SUCCESS_STATUS, contentType: 'image/png', bodyText: '', bodyBytes: pictureBytes,
      });
      expect(seen).toEqual([{ contentType: 'image/png', bytes: pictureBytes }]);
    } finally {
      await server.stop(true);
    }
  });

  test('throws for a request that carries a JSON body and a byte body', async () => {
    const byteBody = { bytes: new Uint8Array(1), mediaType: 'image/png' };
    const twoBodies: OverseerRequest = { ...requestOf('http://127.0.0.1:1/', 'POST', PATHS.commands, EXAMPLE_TOKEN, '{}'), byteBody };
    await expect(realOverseerFetch().request(twoBodies)).rejects.toThrow('never both');
  });

  test('sends no authorization without a token', async () => {
    const authorizations: (string | null)[] = [];
    const server = Bun.serve({
      hostname: '127.0.0.1',
      port:     0,
      fetch:    (request) => {
        authorizations.push(request.headers.get('Authorization'));
        return Response.json({ application: 'forge' });
      },
    });
    try {
      await realOverseerFetch().request(requestOf(server.url.href, 'GET', PATHS.identity, null));
      expect(authorizations).toEqual([null]);
    } finally {
      await server.stop(true);
    }
  });

  test('answers timed-out for an Overseer that accepts the connection and never answers', async () => {
    const silentListener = Bun.listen({ hostname: '127.0.0.1', port: 0, socket: { data: () => undefined } });
    try {
      const identityRequest = requestOf(`http://127.0.0.1:${silentListener.port}/`, 'GET', PATHS.identity, null);
      const answer = await realOverseerFetch().request({ ...identityRequest, timeoutMilliseconds: SHORT_BOUND_MILLISECONDS });
      expect(answer).toEqual({ verdict: 'timed-out' });
    } finally {
      silentListener.stop(true);
    }
  });
});

describe('a stream', () => {
  const encoder = new TextEncoder();

  test('hands on the text as it arrives, a character cut between two chunks included, and ends closed when the Overseer ends it', async () => {
    const wholeText = 'event: monitor\ndata: {"project":"Café"}\n\n';
    const bytes     = encoder.encode(wholeText);
    const cutInsideTheCharacter = bytes.indexOf(0xC3) + 1;
    const server = Bun.serve({
      hostname: '127.0.0.1',
      port:     0,
      fetch:    () => new Response(new ReadableStream({
        start: (controller) => {
          controller.enqueue(bytes.slice(0, cutInsideTheCharacter));
          controller.enqueue(bytes.slice(cutInsideTheCharacter));
          controller.close();
        },
      }), { headers: { 'Content-Type': 'text/event-stream' } }),
    });
    try {
      const stream = streamOf(await realOverseerFetch().openStream(streamRequestOf(server.url.href)));
      expect(await textUntilTheEndOf(stream)).toEqual({ text: wholeText, ending: 'closed' });
      expect(await stream.nextChunk()).toEqual({ kind: 'ended', ending: 'closed' });
    } finally {
      await server.stop(true);
    }
  });

  test('sends the last event id it is given as Last-Event-ID, and none when it is given none', async () => {
    const lastEventIds: (string | null)[] = [];
    const server = Bun.serve({
      hostname: '127.0.0.1',
      port:     0,
      fetch:    (request) => {
        lastEventIds.push(request.headers.get('Last-Event-ID'));
        return new Response('', { headers: { 'Content-Type': 'text/event-stream' } });
      },
    });
    try {
      for (const lastEventId of ['1-35', null]) {
        streamOf(await realOverseerFetch().openStream({ ...streamRequestOf(server.url.href), lastEventId })).close();
      }
      expect(lastEventIds).toEqual(['1-35', null]);
    } finally {
      await server.stop(true);
    }
  });

  test('answers a head other than an event stream with its status and body', async () => {
    const server = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch: () => Response.json({ refusal: 'unauthorized' }, { status: UNAUTHORIZED_STATUS }) });
    try {
      expect(await realOverseerFetch().openStream(streamRequestOf(server.url.href, WRONG_TOKEN)))
        .toMatchObject({ verdict: 'answered', status: UNAUTHORIZED_STATUS, bodyText: '{"refusal":"unauthorized"}' });
    } finally {
      await server.stop(true);
    }
  });

  test('ends closed when it is closed while the Overseer holds it open', async () => {
    const server = Bun.serve({
      hostname: '127.0.0.1',
      port:     0,
      fetch:    () => new Response(
        new ReadableStream({ start: (controller) => controller.enqueue(encoder.encode(': ping\n\n')) }),
        { headers: { 'Content-Type': 'text/event-stream' } },
      ),
    });
    try {
      const stream = streamOf(await realOverseerFetch().openStream(streamRequestOf(server.url.href)));
      expect(await stream.nextChunk()).toEqual({ kind: 'text', text: ': ping\n\n' });
      const pendingChunk = stream.nextChunk();
      stream.close();
      expect(await pendingChunk).toEqual({ kind: 'ended', ending: 'closed' });
    } finally {
      await server.stop(true);
    }
  });

  test('ends broken when the connection breaks inside the stream', async () => {
    const head = 'HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\nTransfer-Encoding: chunked\r\n\r\n';
    let breakTheConnection = (): void => undefined;
    const breakingListener = Bun.listen({
      hostname: '127.0.0.1',
      port:     0,
      socket:   {
        data: (socket) => {
          socket.write(`${head}7\r\nevent: \r\n`);
          breakTheConnection = () => socket.end();
        },
      },
    });
    try {
      const stream = streamOf(await realOverseerFetch().openStream(streamRequestOf(`http://127.0.0.1:${breakingListener.port}/`)));
      // The connection breaks only once the client holds the first chunk: a break in the same moment may take the chunk with it.
      expect(await stream.nextChunk()).toEqual({ kind: 'text', text: 'event: ' });
      breakTheConnection();
      expect(await textUntilTheEndOf(stream)).toEqual({ text: '', ending: 'broken' });
    } finally {
      breakingListener.stop(true);
    }
  });

  test('answers timed-out when no head arrives within the bound', async () => {
    const silentListener = Bun.listen({ hostname: '127.0.0.1', port: 0, socket: { data: () => undefined } });
    try {
      const silentAddress = `http://127.0.0.1:${silentListener.port}/`;
      const answer = await realOverseerFetch().openStream(streamRequestOf(silentAddress, EXAMPLE_TOKEN, SHORT_BOUND_MILLISECONDS));
      expect(answer).toEqual({ verdict: 'timed-out' });
    } finally {
      silentListener.stop(true);
    }
  });
});
