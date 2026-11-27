/**
 * The real-system spec of hephaestus-fetch against local Bun servers, run only by `bun run record hephaestus-fetch-other-programs`: it records what
 * programs that are no forge answer at each path Gaia calls, which no forge can be brought to send, and proves the rest of the boundary against the
 * real `fetch`. Bun stamps it.
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
  type HephaestusSituation,
  type RecordedStreamAnswer,
} from '../../testing/RecordedAnswers.ts';

import { ApiPathUtil } from '../api-paths/ApiPathUtil.ts';

import { forgeEndpointVersionOf } from './ForgeClient.ts';
import {
  realHephaestusFetch,
  type HephaestusAnswer,
  type HephaestusRequest,
  type HephaestusStream,
  type HephaestusStreamAnswer,
  type HephaestusStreamRequest,
} from './HephaestusFetch.ts';

const RECORDING_NAME = 'hephaestus-fetch-other-programs';
const GENEROUS_BOUND_MILLISECONDS = 10_000;
const SHORT_BOUND_MILLISECONDS = 200;
const EXAMPLE_TOKEN = 'example-token';
const WRONG_TOKEN = 'example-token-of-another-hephaestus';
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

function requestOf(hephaestusUrl: string, method: HephaestusRequest['method'], path: string, bearerToken: string | null, jsonBody: string | null = null): HephaestusRequest {
  return {
    hephaestusUrl,
    method,
    path,
    bearerToken,
    jsonBody:            jsonBody ?? (method === 'POST' ? '{"kind":"hephaestus-pause"}' : null),
    byteBody:            null,
    answerAs:            'text',
    timeoutMilliseconds: GENEROUS_BOUND_MILLISECONDS,
  };
}

function streamRequestOf(hephaestusUrl: string, bearerToken = EXAMPLE_TOKEN, timeoutMilliseconds = GENEROUS_BOUND_MILLISECONDS): HephaestusStreamRequest {
  return {
    hephaestusUrl, path: PATHS.monitorEvents, bearerToken, lastEventId: null, timeoutMilliseconds,
  };
}

function streamOf(answer: HephaestusStreamAnswer): HephaestusStream {
  if (answer.verdict !== 'streaming') throw new Error(`The stream answered ${JSON.stringify(answer)}`);
  return answer.stream;
}

async function textUntilTheEndOf(stream: HephaestusStream): Promise<{ readonly text: string; readonly ending: string }> {
  let text  = '';
  let chunk = await stream.nextChunk();
  while (chunk.kind === 'text') {
    text += chunk.text;
    chunk = await stream.nextChunk();
  }
  return { text, ending: chunk.ending };
}

async function streamAnswerUntilTheEnd(stream: HephaestusStream): Promise<RecordedStreamAnswer> {
  const chunks: string[] = [];
  for (;;) {
    const chunk = await stream.nextChunk();
    if (chunk.kind === 'ended') return { verdict: 'streaming', chunks, ending: chunk.ending };
    chunks.push(chunk.text);
  }
}

async function recordStream(situation: HephaestusSituation, hephaestusUrl: string): Promise<RecordedStreamAnswer | HephaestusAnswer> {
  const opening = await realHephaestusFetch().openStream(streamRequestOf(hephaestusUrl));
  const answer  = opening.verdict === 'streaming' ? await streamAnswerUntilTheEnd(opening.stream) : opening;
  recordAnswer(RECORDING_NAME, situationCallShapeOf(situation, streamCallShapeOf(streamRequestOf(hephaestusUrl))), answer);
  return answer;
}

describe('another program on Hephaestus\'s port', () => {
  test('answers its web page to every request and stream Gaia sends a forge', async () => {
    const hephaestusUrl = serverAnswering(() => new Response(WEB_PAGE, { headers: { 'Content-Type': 'text/html' } }));
    const requests = [
      requestOf(hephaestusUrl, 'GET', ApiPathUtil.VERSIONS_PATH, null),
      requestOf(hephaestusUrl, 'GET', PATHS.identity, null),
      requestOf(hephaestusUrl, 'GET', PATHS.summary, null),
      requestOf(hephaestusUrl, 'GET', PATHS.monitor, EXAMPLE_TOKEN),
      requestOf(hephaestusUrl, 'POST', PATHS.commands, EXAMPLE_TOKEN),
    ];
    for (const pageRequest of requests) {
      const answer = await realHephaestusFetch().request(pageRequest);
      expect(answer).toMatchObject({ verdict: 'answered', status: 200, bodyText: WEB_PAGE });
      recordAnswer(RECORDING_NAME, situationCallShapeOf('port-held-by-another-program', requestCallShapeOf(pageRequest)), answer);
    }
    expect(await recordStream('port-held-by-another-program', hephaestusUrl)).toMatchObject({ verdict: 'answered', status: 200, bodyText: WEB_PAGE });
  });
});

describe('an event stream that is not a forge\'s', () => {
  test('sends an event no snapshot can be read from, then a whole one, and ends', async () => {
    const hephaestusUrl = serverAnswering(() => eventStreamOf([monitorEventOf('{"monitorVersion":1,"trackerId"'), monitorEventOf(WHOLE_SNAPSHOT)]));
    expect(await recordStream('snapshot-unreadable', hephaestusUrl)).toMatchObject({ verdict: 'streaming', ending: 'closed' });
  });

  test('sends a whole event, then ends inside the next', async () => {
    const hephaestusUrl = serverAnswering(() => eventStreamOf([monitorEventOf(WHOLE_SNAPSHOT), `event: monitor\ndata: ${WHOLE_SNAPSHOT.slice(0, WHOLE_SNAPSHOT.length / 2)}`]));
    expect(await recordStream('stream-cut-inside-event', hephaestusUrl)).toMatchObject({ verdict: 'streaming', ending: 'closed' });
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
      const answer = await realHephaestusFetch().request(requestOf(server.url.href, 'POST', PATHS.commands, EXAMPLE_TOKEN, '{"kind":"hephaestus-pause"}'));
      expect(answer).toMatchObject({ verdict: 'answered', status: SUCCESS_STATUS, bodyText: '{"outcome":"done"}' });
      expect(seen).toEqual([{ authorization: `Bearer ${EXAMPLE_TOKEN}`, contentType: 'application/json', body: '{"kind":"hephaestus-pause"}' }]);
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
      const byteRequest: HephaestusRequest = {
        ...requestOf(server.url.href, 'POST', PATHS.commands, EXAMPLE_TOKEN), jsonBody: null, byteBody: { bytes: pictureBytes, mediaType: 'image/png' }, answerAs: 'bytes',
      };
      expect(await realHephaestusFetch().request(byteRequest)).toEqual({
        verdict: 'answered', status: SUCCESS_STATUS, contentType: 'image/png', bodyText: '', bodyBytes: pictureBytes,
      });
      expect(seen).toEqual([{ contentType: 'image/png', bytes: pictureBytes }]);
    } finally {
      await server.stop(true);
    }
  });

  test('throws for a request that carries a JSON body and a byte body', async () => {
    const byteBody = { bytes: new Uint8Array(1), mediaType: 'image/png' };
    const twoBodies: HephaestusRequest = { ...requestOf('http://127.0.0.1:1/', 'POST', PATHS.commands, EXAMPLE_TOKEN, '{}'), byteBody };
    await expect(realHephaestusFetch().request(twoBodies)).rejects.toThrow('never both');
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
      await realHephaestusFetch().request(requestOf(server.url.href, 'GET', PATHS.identity, null));
      expect(authorizations).toEqual([null]);
    } finally {
      await server.stop(true);
    }
  });

  test('answers timed-out for a Hephaestus that accepts the connection and never answers', async () => {
    const silentListener = Bun.listen({ hostname: '127.0.0.1', port: 0, socket: { data: () => undefined } });
    try {
      const identityRequest = requestOf(`http://127.0.0.1:${silentListener.port}/`, 'GET', PATHS.identity, null);
      const answer = await realHephaestusFetch().request({ ...identityRequest, timeoutMilliseconds: SHORT_BOUND_MILLISECONDS });
      expect(answer).toEqual({ verdict: 'timed-out' });
    } finally {
      silentListener.stop(true);
    }
  });
});

describe('a stream', () => {
  const encoder = new TextEncoder();

  test('hands on the text as it arrives, a character cut between two chunks included, and ends closed when Hephaestus ends it', async () => {
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
      const stream = streamOf(await realHephaestusFetch().openStream(streamRequestOf(server.url.href)));
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
        streamOf(await realHephaestusFetch().openStream({ ...streamRequestOf(server.url.href), lastEventId })).close();
      }
      expect(lastEventIds).toEqual(['1-35', null]);
    } finally {
      await server.stop(true);
    }
  });

  test('answers a head other than an event stream with its status and body', async () => {
    const server = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch: () => Response.json({ refusal: 'unauthorized' }, { status: UNAUTHORIZED_STATUS }) });
    try {
      expect(await realHephaestusFetch().openStream(streamRequestOf(server.url.href, WRONG_TOKEN)))
        .toMatchObject({ verdict: 'answered', status: UNAUTHORIZED_STATUS, bodyText: '{"refusal":"unauthorized"}' });
    } finally {
      await server.stop(true);
    }
  });

  test('ends closed when it is closed while Hephaestus holds it open', async () => {
    const server = Bun.serve({
      hostname: '127.0.0.1',
      port:     0,
      fetch:    () => new Response(
        new ReadableStream({ start: (controller) => controller.enqueue(encoder.encode(': ping\n\n')) }),
        { headers: { 'Content-Type': 'text/event-stream' } },
      ),
    });
    try {
      const stream = streamOf(await realHephaestusFetch().openStream(streamRequestOf(server.url.href)));
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
      const stream = streamOf(await realHephaestusFetch().openStream(streamRequestOf(`http://127.0.0.1:${breakingListener.port}/`)));
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
      const answer = await realHephaestusFetch().openStream(streamRequestOf(silentAddress, EXAMPLE_TOKEN, SHORT_BOUND_MILLISECONDS));
      expect(answer).toEqual({ verdict: 'timed-out' });
    } finally {
      silentListener.stop(true);
    }
  });
});
