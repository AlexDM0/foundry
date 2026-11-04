/**
 * The recorded local endpoint may give only what the real socket or pipe answered. What matters most is that the end of a connection
 * reaches no client that did not read it, as on a real socket, since a mock that closed it hid a real stall; then that a call with no
 * recorded answer fails, that a write after `end` and a connect to a removed endpoint are refused, and that a Watcher socket answers each
 * `hello` over the mock with the frames the real one sent. A destroy gives its peer the recorded end and close, also a peer that does not
 * read, unlike an end.
 */
import type { Socket } from 'node:net';
import {
  beforeEach,
  describe,
  expect,
  test
} from 'bun:test';

import type { WatcherSocketListening } from '../lib/watcher/WatcherSocketServer.ts';
import { listenOnWatcherSocket }       from '../lib/watcher/WatcherSocketServer.ts';
import { WATCHER_PROTOCOL_VERSION }    from '../lib/watcher/constants/WatcherProtocol.ts';
import {
  createRecordedLocalEndpoint,
  type DestroyAnswer,
  ENDPOINT_CALL_SHAPES,
  type EndpointCallShape,
  type HelloAnswer,
  type RecordedLocalEndpoint,
  recordedEndpointAnswerOf
} from './RecordedLocalEndpoint.ts';

const WATCHER_SECRET = 'example-secret';

let recorded: RecordedLocalEndpoint;
let lastInstance = 0;

beforeEach(() => {
  recorded = createRecordedLocalEndpoint();
});

function nextEndpoint(): string {
  lastInstance += 1;
  return recorded.endpoint.endpointOf({
    monitorFolder: '/example/monitor', trackerId: 'tracker-example', jobId: 'J-1', instance: lastInstance
  });
}

/** Two turns of the event loop: every answer the mock gives, at once or after a wait, has been given by then. */
async function afterEveryMockedAnswer(): Promise<void> {
  for (const _turn of [1, 2]) await new Promise<void>((resolve) => setImmediate(resolve));
}

async function listenOutcomeOf(endpoint: string, onConnection: (socket: Socket) => void = () => undefined): Promise<string> {
  const server = recorded.endpoint.serverOf(onConnection);
  return await new Promise<string>((resolve) => {
    server.once('error', (error: NodeJS.ErrnoException) => resolve(error.code ?? String(error)));
    server.listen(endpoint, () => resolve('listening'));
  });
}

async function connectOutcomeOf(endpoint: string): Promise<{ readonly outcome: string; readonly socket: Socket }> {
  const socket = recorded.endpoint.connectionTo(endpoint);
  const outcome = await new Promise<string>((resolve) => {
    socket.once('error', (error: NodeJS.ErrnoException) => resolve(error.code ?? String(error)));
    socket.once('connect', () => resolve('connected'));
  });
  return { outcome, socket };
}

interface WatchedClient {
  readonly socket:   Socket;
  readonly received: () => string;
  readonly ended:    () => boolean;
  readonly closed:   () => boolean;
}

function watched(socket: Socket, reads: boolean): WatchedClient {
  let received = '';
  let ended = false;
  let closed = false;
  if (reads) {
    socket.on('data', (chunk: Buffer) => {
      received += chunk.toString('utf8');
    });
  }
  socket.on('end', () => {
    ended = true;
  });
  socket.on('close', () => {
    closed = true;
  });
  return {
    socket, received: () => received, ended: () => ended, closed: () => closed
  };
}

async function watcherSocketOn(endpoint: string): Promise<WatcherSocketListening> {
  return await listenOnWatcherSocket({
    endpoint:       recorded.endpoint,
    socketPath:     endpoint,
    watcherSecret:  WATCHER_SECRET,
    acceptedKinds:  [],
    welcomeOf:      () => ({ watcherCodeVersion: 'code-example', jobId: 'J-1', state: 'idle' }),
    durableEntries: () => [],
    onClientLine:   () => undefined,
    onActingFrame:  () => undefined,
  });
}

function recordedCodeOf(callShape: EndpointCallShape): string {
  return (recordedEndpointAnswerOf(callShape) as { readonly code?: string }).code ?? `no error code is recorded for ${callShape}`;
}

describe('a call with no recorded answer', () => {
  test('fails, and is kept for the case to fail on', () => {
    const answersWithoutAListen = new Map(Object.values(ENDPOINT_CALL_SHAPES)
      .filter((callShape) => callShape !== ENDPOINT_CALL_SHAPES.LISTEN_ON_A_FREE_PATH)
      .map((callShape) => [callShape, recordedEndpointAnswerOf(callShape)]));
    recorded = createRecordedLocalEndpoint(answersWithoutAListen);
    expect(() => recorded.endpoint.serverOf(() => undefined).listen(nextEndpoint())).toThrow('has no recorded answer');
    expect(recorded.takeUnansweredCalls()).toEqual([expect.stringContaining(ENDPOINT_CALL_SHAPES.LISTEN_ON_A_FREE_PATH)]);
  });
});

describe('a listen', () => {
  test('on a free endpoint listens, and a second listen there gets the recorded refusal', async () => {
    const endpoint = nextEndpoint();
    expect(await listenOutcomeOf(endpoint)).toBe('listening');
    expect(await listenOutcomeOf(endpoint)).toBe(recordedCodeOf(ENDPOINT_CALL_SHAPES.LISTEN_ON_A_TAKEN_PATH));
  });

  test('on an endpoint longer than the platform keeps gets the recorded refusal', async () => {
    expect(await listenOutcomeOf(`${nextEndpoint()}${'x'.repeat(200)}`)).toBe(recordedCodeOf(ENDPOINT_CALL_SHAPES.LISTEN_ON_A_PATH_TOO_LONG));
  });
});

describe('a connect', () => {
  test('to an endpoint nothing was bound to gets the recorded refusal', async () => {
    expect((await connectOutcomeOf(nextEndpoint())).outcome).toBe(recordedCodeOf(ENDPOINT_CALL_SHAPES.CONNECT_WITH_NO_LISTENER));
  });

  test('to what a killed listener left gets the recorded refusal, until a prepare clears it', async () => {
    const endpoint = nextEndpoint();
    await listenOutcomeOf(endpoint);
    recorded.killListener(endpoint);
    expect((await connectOutcomeOf(endpoint)).outcome).toBe(recordedCodeOf(ENDPOINT_CALL_SHAPES.CONNECT_TO_A_STALE_SOCKET));
    expect(recorded.endpoint.prepareEndpoint(endpoint)).toEqual({ verdict: 'done' });
    expect(await listenOutcomeOf(endpoint)).toBe('listening');
  });

  test('to an endpoint released while its server listens is refused as the real one was', async () => {
    const endpoint = nextEndpoint();
    await listenOutcomeOf(endpoint);
    expect(recorded.endpoint.releaseEndpoint(endpoint)).toEqual({ verdict: 'done' });
    const removedAnswer = recordedEndpointAnswerOf(ENDPOINT_CALL_SHAPES.CONNECT_TO_A_REMOVED_PATH) as { readonly outcome: string; readonly code?: string };
    expect((await connectOutcomeOf(endpoint)).outcome).toBe(removedAnswer.code ?? removedAnswer.outcome);
  });
});

describe('the end of a connection', () => {
  test('never reaches a client that did not read it: no end and no close, until the client reads', async () => {
    const endpoint = nextEndpoint();
    await listenOutcomeOf(endpoint, (socket) => socket.end('example line\n'));
    const client = watched((await connectOutcomeOf(endpoint)).socket, false);
    await afterEveryMockedAnswer();
    expect({ ended: client.ended(), closed: client.closed() }).toEqual({ ended: false, closed: false });

    let read = '';
    client.socket.on('data', (chunk: Buffer) => {
      read += chunk.toString('utf8');
    });
    await afterEveryMockedAnswer();
    expect({ read, ended: client.ended(), closed: client.closed() }).toEqual({ read: 'example line\n', ended: true, closed: true });
  });

  test('of a reading client reaches the server, which ends in turn, so both close', async () => {
    const endpoint = nextEndpoint();
    let serverEnded = false;
    await listenOutcomeOf(endpoint, (socket) => {
      socket.on('data', () => undefined);
      socket.on('end', () => {
        serverEnded = true;
      });
    });
    const client = watched((await connectOutcomeOf(endpoint)).socket, true);
    client.socket.end('example line\n');
    await afterEveryMockedAnswer();
    expect({ serverEnded, ended: client.ended(), closed: client.closed() }).toEqual({ serverEnded: true, ended: true, closed: true });
  });

  test('refuses a write after it with the recorded error', async () => {
    const endpoint = nextEndpoint();
    await listenOutcomeOf(endpoint, (socket) => socket.on('data', () => undefined));
    const { socket } = await connectOutcomeOf(endpoint);
    socket.on('data', () => undefined);
    socket.end();
    const code = await new Promise<string | undefined>((resolve) => {
      socket.once('error', (error: NodeJS.ErrnoException) => resolve(error.code));
      socket.write('example line\n');
    });
    expect(code).toBe(recordedCodeOf(ENDPOINT_CALL_SHAPES.WRITE_AFTER_END));
  });
});

describe('a destroy of a connection', () => {
  test.each([
    ['server', true, ENDPOINT_CALL_SHAPES.SERVER_DESTROY_THE_CLIENT_READ],
    ['server', false, ENDPOINT_CALL_SHAPES.SERVER_DESTROY_THE_CLIENT_DID_NOT_READ],
    ['client', true, ENDPOINT_CALL_SHAPES.CLIENT_DESTROY_THE_SERVER_READ],
    ['client', false, ENDPOINT_CALL_SHAPES.CLIENT_DESTROY_THE_SERVER_DID_NOT_READ],
  ] as const)('by the %s gives the peer, reading %p, the end and the close the real one gave', async (destroyingSide, peerReads, callShape) => {
    const endpoint = nextEndpoint();
    let serverSocket: Socket | null = null;
    await listenOutcomeOf(endpoint, (socket) => {
      serverSocket = socket;
    });
    const clientSocket = (await connectOutcomeOf(endpoint)).socket;
    if (serverSocket === null) throw new Error('the server got no connection');
    const [destroying, peerSocket]: [Socket, Socket] = destroyingSide === 'client' ? [clientSocket, serverSocket] : [serverSocket, clientSocket];
    const peer = watched(peerSocket, peerReads);
    destroying.destroy();
    await afterEveryMockedAnswer();
    const realAnswer = recordedEndpointAnswerOf(callShape) as DestroyAnswer;
    expect({ ended: peer.ended(), closed: peer.closed() }).toEqual({ ended: realAnswer.peerSawEnd, closed: realAnswer.closeArrived });
  });
});

describe('a Watcher socket over the mock', () => {
  test.each([
    ['another secret', 'another-secret', ENDPOINT_CALL_SHAPES.HELLO_WITH_A_BAD_SECRET],
    ['the secret', WATCHER_SECRET, ENDPOINT_CALL_SHAPES.HELLO_WITH_THE_SECRET],
  ] as const)('answers a hello with %s with the frames, the end and the close the real one gave', async (_case, watcherSecret, callShape) => {
    const endpoint = nextEndpoint();
    const listening = await watcherSocketOn(endpoint);
    if (listening.verdict !== 'listening') throw new Error(listening.reason);
    const client = watched((await connectOutcomeOf(endpoint)).socket, true);
    client.socket.write(`${JSON.stringify({
      kind: 'hello', protocolVersion: WATCHER_PROTOCOL_VERSION, sinceSequence: 0, watcherSecret
    })}\n`);
    await afterEveryMockedAnswer();
    const realAnswer = recordedEndpointAnswerOf(callShape) as HelloAnswer;
    const frames = client.received().split('\n').filter((line) => line !== '').map((line) => JSON.parse(line) as unknown);
    expect({ frames, endArrived: client.ended(), closeArrived: client.closed() })
      .toEqual({ frames: [...realAnswer.frames], endArrived: realAnswer.endArrived, closeArrived: realAnswer.closeArrived });
    listening.server.close();
  });
});
