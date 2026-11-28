/**
 * The real answers of this platform's local endpoint, recorded with their timing class for `src/testing/RecordedLocalEndpoint.ts`. What
 * matters most is the end of a connection: it reaches a client only once that client reads, so a mock that closed an unread client would
 * hide a real stall.
 */
import type { Server, Socket }    from 'node:net';
import { afterAll, expect, test } from 'bun:test';

import { listenOnIdleTalosSocket, talosHelloLineOf } from '../../../talos/testing/IdleTalosSocket.ts';
import { recordAnswer }                              from '../../testing/RecordedAnswers.ts';
import {
  type ConnectAnswer,
  type DestroyAnswer,
  type EndAnswer,
  ENDPOINT_CALL_SHAPES,
  type HelloAnswer,
  type ListenAnswer,
  type PeerEvent,
  timingOf,
  type UnreadDestroyAnswer,
  type WriteAfterEndAnswer
} from '../../testing/RecordedLocalEndpoint.ts';
import { createScratchDirectory, removeScratchDirectory } from '../../testing/ScratchWorkspace.ts';
import type { LocalEndpoint }                             from './LocalEndpoint.ts';
import { localEndpointFor }                               from './LocalEndpointFor.ts';


const PIPE_NAME_PREFIX = 'example-product';
const TALOS_SECRET = 'example-secret';
const TOO_LONG_SUFFIX_CHARACTERS = 200;
/** How long a case waits for an end or a close that may never come; past the limit of an answer given at once. */
const NEVER_ARRIVES_WAIT_MILLISECONDS = 1500;
const SIGKILL_EXIT_CODE = 137;

const port: LocalEndpoint = localEndpointFor(process.platform, PIPE_NAME_PREFIX);
const scratchFolders: string[] = [];
const openServers: Server[] = [];

afterAll(() => {
  for (const server of openServers) server.close();
  for (const folder of scratchFolders) removeScratchDirectory(folder);
});

function preparedEndpoint(): string {
  // The short prefix keeps a socket path under the macOS limit inside the scratch root.
  const socketFolder = createScratchDirectory('e');
  scratchFolders.push(socketFolder);
  const endpoint = port.endpointOf({
    socketFolder, scope: 'scope-example', name: 'J-1', instance: 1
  });
  expect(port.prepareEndpoint(endpoint)).toEqual({ verdict: 'done' });
  return endpoint;
}

function millisecondsSince(startedAt: number): number {
  return performance.now() - startedAt;
}

async function listenAnswerOf(endpoint: string, onConnection: (socket: Socket) => void = () => undefined): Promise<ListenAnswer> {
  const server = port.serverOf(onConnection);
  const startedAt = performance.now();
  const errorCode = await new Promise<string | null>((resolve) => {
    server.once('error', (error: NodeJS.ErrnoException) => resolve(error.code ?? String(error)));
    server.listen(endpoint, () => resolve(null));
  });
  const timing = timingOf(millisecondsSince(startedAt));
  if (errorCode !== null) return { outcome: 'error', code: errorCode, timing };
  openServers.push(server);
  return { outcome: 'listening', timing };
}

async function connectAnswerOf(endpoint: string): Promise<ConnectAnswer> {
  const startedAt = performance.now();
  const connection = port.connectionTo(endpoint);
  const errorCode = await new Promise<string | null>((resolve) => {
    connection.once('error', (error: NodeJS.ErrnoException) => resolve(error.code ?? String(error)));
    connection.once('connect', () => resolve(null));
  });
  const timing = timingOf(millisecondsSince(startedAt));
  connection.destroy();
  return errorCode === null ? { outcome: 'connected', timing } : { outcome: 'error', code: errorCode, timing };
}

async function connected(endpoint: string): Promise<Socket> {
  const connection = port.connectionTo(endpoint);
  await new Promise<void>((resolve, reject) => {
    connection.once('error', reject);
    connection.once('connect', () => resolve());
  });
  return connection;
}

/** Resolves true once the event arrives, or false once the wait for an answer that may never come is over. */
async function arrives(emitter: Socket, event: 'end' | 'close'): Promise<boolean> {
  return await new Promise<boolean>((resolve) => {
    const timer = setTimeout(() => resolve(false), NEVER_ARRIVES_WAIT_MILLISECONDS);
    emitter.once(event, () => {
      clearTimeout(timer);
      resolve(true);
    });
  });
}

async function helloAnswerOf(secret: string): Promise<HelloAnswer> {
  const endpoint = preparedEndpoint();
  const listening = await listenOnIdleTalosSocket(port, endpoint, TALOS_SECRET);
  if (listening.verdict !== 'listening') throw new Error(listening.systemError);
  const client = await connected(endpoint);
  let received = '';
  let endArrived = false;
  client.on('data', (chunk: Buffer) => {
    received += chunk.toString('utf8');
  });
  client.on('end', () => {
    endArrived = true;
  });
  const startedAt = performance.now();
  const closing = arrives(client, 'close');
  client.write(talosHelloLineOf(secret));
  const closeArrived = await closing;
  const frames = received.split('\n').filter((line) => line !== '').map((line) => JSON.parse(line) as unknown);
  const timing = timingOf(closeArrived ? millisecondsSince(startedAt) : 0);
  client.destroy();
  listening.server.close();
  return {
    frames, endArrived, closeArrived, timing
  };
}

/** One side ends the connection; the answer is what the other side, the peer, saw. The server always reads. */
async function endAnswerOf(endingSide: 'client' | 'server', clientReads: boolean): Promise<EndAnswer> {
  const endpoint = preparedEndpoint();
  let resolveServerConnection: (socket: Socket) => void = () => undefined;
  const serverConnection = new Promise<Socket>((resolve) => {
    resolveServerConnection = resolve;
  });
  await listenAnswerOf(endpoint, (socket) => {
    socket.on('data', () => undefined);
    resolveServerConnection(socket);
  });
  const client = await connected(endpoint);
  if (clientReads) client.on('data', () => undefined);
  const server = await serverConnection;
  const [ending, peer] = endingSide === 'client' ? [client, server] : [server, client];
  let peerSawEnd = false;
  let peerEndedInTurn = false;
  peer.once('end', () => {
    peerSawEnd = true;
  });
  ending.once('end', () => {
    peerEndedInTurn = true;
  });
  const startedAt = performance.now();
  const closing = arrives(peer, 'close');
  const endingSideClosing = arrives(ending, 'close');
  ending.end(endingSide === 'server' ? 'example line\n' : '');
  const closeArrived = await closing;
  const timing = timingOf(closeArrived ? millisecondsSince(startedAt) : NEVER_ARRIVES_WAIT_MILLISECONDS);
  await endingSideClosing;
  client.destroy();
  server.destroy();
  return {
    peerSawEnd, peerEndedInTurn, closeArrived, timing
  };
}

/** One side destroys the connection; the answer is what the other side, the peer, saw. */
async function destroyAnswerOf(destroyingSide: 'client' | 'server', peerReads: boolean): Promise<DestroyAnswer> {
  const endpoint = preparedEndpoint();
  let resolveServerConnection: (socket: Socket) => void = () => undefined;
  const serverConnection = new Promise<Socket>((resolve) => {
    resolveServerConnection = resolve;
  });
  await listenAnswerOf(endpoint, resolveServerConnection);
  const client = await connected(endpoint);
  const server = await serverConnection;
  const [destroying, peer] = destroyingSide === 'client' ? [client, server] : [server, client];
  if (peerReads) peer.on('data', () => undefined);
  let peerSawEnd = false;
  peer.once('end', () => {
    peerSawEnd = true;
  });
  const startedAt = performance.now();
  const closing = arrives(peer, 'close');
  destroying.destroy();
  const closeArrived = await closing;
  const timing = timingOf(closeArrived ? millisecondsSince(startedAt) : NEVER_ARRIVES_WAIT_MILLISECONDS);
  peer.destroy();
  return { peerSawEnd, closeArrived, timing };
}

/** Resolves once the socket holds unread data, as the mock's peer does at once after a write. */
async function untilBuffered(socket: Socket): Promise<void> {
  const startedAt = performance.now();
  while (socket.readableLength === 0) {
    if (millisecondsSince(startedAt) > NEVER_ARRIVES_WAIT_MILLISECONDS) throw new Error('the written line never reached the peer');
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
}

/**
 * One side writes a line and destroys the connection; the peer reads only after the wait. The answer is the order of what the peer saw,
 * which differs when the peer listens for errors.
 */
async function unreadDestroyAnswerOf(destroyingSide: 'client' | 'server', peerListensForErrors: boolean): Promise<UnreadDestroyAnswer> {
  const endpoint = preparedEndpoint();
  let resolveServerConnection: (socket: Socket) => void = () => undefined;
  const serverConnection = new Promise<Socket>((resolve) => {
    resolveServerConnection = resolve;
  });
  await listenAnswerOf(endpoint, resolveServerConnection);
  const client = await connected(endpoint);
  const server = await serverConnection;
  const [destroying, peer] = destroyingSide === 'client' ? [client, server] : [server, client];
  peer.removeAllListeners('error');
  const peerEvents: PeerEvent[] = [];
  const eventMilliseconds: number[] = [];
  const errorCodes: string[] = [];
  for (const event of ['end', 'close'] as const) {
    peer.on(event, () => {
      eventMilliseconds.push(performance.now());
      peerEvents.push(event);
    });
  }
  if (peerListensForErrors) {
    peer.on('error', (error: NodeJS.ErrnoException) => {
      eventMilliseconds.push(performance.now());
      peerEvents.push('error');
      errorCodes.push(error.code ?? String(error));
    });
  }
  destroying.write('example line\n');
  await untilBuffered(peer);
  const startedAt = performance.now();
  destroying.destroy();
  await arrives(peer, 'close');
  const eventsBeforeRead = peerEvents.splice(0);
  const [firstEventAt] = eventMilliseconds;
  peer.on('data', () => peerEvents.push('data'));
  await arrives(peer, 'close');
  peer.destroy();
  return {
    eventsBeforeRead,
    eventsAfterRead: peerEvents.splice(0),
    errorCode:       errorCodes[0] ?? null,
    timing:          timingOf(firstEventAt === undefined ? NEVER_ARRIVES_WAIT_MILLISECONDS : firstEventAt - startedAt),
  };
}

/** A process that binds the endpoint and dies by SIGKILL, so nothing of it runs to close the listener or clear what it made. */
async function killedWhileListening(endpoint: string): Promise<void> {
  const script = `require('node:net').createServer().listen(${JSON.stringify(endpoint)}, () => process.kill(process.pid, 'SIGKILL'));`;
  expect(await Bun.spawn([process.execPath, '-e', script], { stdout: 'ignore', stderr: 'ignore' }).exited).toBe(SIGKILL_EXIT_CODE);
}

test('a listen on a free endpoint listens', async () => {
  const answer = await listenAnswerOf(preparedEndpoint());
  recordAnswer(ENDPOINT_CALL_SHAPES.LISTEN_ON_A_FREE_PATH, answer);
  expect(answer.outcome).toBe('listening');
});

test('a listen on an endpoint another server holds fails with EADDRINUSE', async () => {
  const endpoint = preparedEndpoint();
  await listenAnswerOf(endpoint);
  const answer = await listenAnswerOf(endpoint);
  recordAnswer(ENDPOINT_CALL_SHAPES.LISTEN_ON_A_TAKEN_PATH, answer);
  expect(answer).toMatchObject({ outcome: 'error', code: 'EADDRINUSE' });
});

test('a listen on an endpoint longer than the platform keeps fails', async () => {
  const endpoint = `${preparedEndpoint()}${'x'.repeat(TOO_LONG_SUFFIX_CHARACTERS)}`;
  expect(port.endpointFits(endpoint)).toBe(false);
  const answer = await listenAnswerOf(endpoint);
  recordAnswer(ENDPOINT_CALL_SHAPES.LISTEN_ON_A_PATH_TOO_LONG, answer);
  expect(answer.outcome).toBe('error');
});

test('a connect to a listening endpoint connects', async () => {
  const endpoint = preparedEndpoint();
  await listenAnswerOf(endpoint);
  const answer = await connectAnswerOf(endpoint);
  recordAnswer(ENDPOINT_CALL_SHAPES.CONNECT_TO_A_LISTENER, answer);
  expect(answer.outcome).toBe('connected');
});

test('a connect to an endpoint nothing was bound to fails', async () => {
  const answer = await connectAnswerOf(preparedEndpoint());
  recordAnswer(ENDPOINT_CALL_SHAPES.CONNECT_WITH_NO_LISTENER, answer);
  expect(answer.outcome).toBe('error');
});

test('a connect to what a killed listener left fails', async () => {
  const endpoint = preparedEndpoint();
  await killedWhileListening(endpoint);
  const answer = await connectAnswerOf(endpoint);
  recordAnswer(ENDPOINT_CALL_SHAPES.CONNECT_TO_A_STALE_SOCKET, answer);
  expect(answer.outcome).toBe('error');
});

test('a connect to an endpoint released while its server listens is answered as the platform answers it', async () => {
  const endpoint = preparedEndpoint();
  await listenAnswerOf(endpoint);
  expect(port.releaseEndpoint(endpoint)).toEqual({ verdict: 'done' });
  const answer = await connectAnswerOf(endpoint);
  recordAnswer(ENDPOINT_CALL_SHAPES.CONNECT_TO_A_REMOVED_PATH, answer);
  expect(['connected', 'error']).toContain(answer.outcome);
});

test('a hello with another secret is answered refused, and the end and the close reach the reading client', async () => {
  const answer = await helloAnswerOf('another-secret');
  recordAnswer(ENDPOINT_CALL_SHAPES.HELLO_WITH_A_BAD_SECRET, answer);
  expect(answer).toMatchObject({ frames: [{ kind: 'refused', reason: 'secret' }], endArrived: true, closeArrived: true });
});

test('a hello with the secret is answered welcome, and the connection stays open', async () => {
  const answer = await helloAnswerOf(TALOS_SECRET);
  recordAnswer(ENDPOINT_CALL_SHAPES.HELLO_WITH_THE_SECRET, answer);
  expect(answer.frames.map((frame) => (frame as { kind: string }).kind)).toEqual(['welcome']);
  expect(answer).toMatchObject({ endArrived: false, closeArrived: false });
});

test('a client half-close reaches the reading server, which ends in turn', async () => {
  const answer = await endAnswerOf('client', true);
  recordAnswer(ENDPOINT_CALL_SHAPES.CLIENT_HALF_CLOSE, answer);
  expect(answer).toMatchObject({ peerSawEnd: true, peerEndedInTurn: true, closeArrived: true });
});

test('a server end reaches a reading client', async () => {
  const answer = await endAnswerOf('server', true);
  recordAnswer(ENDPOINT_CALL_SHAPES.SERVER_END_THE_CLIENT_READ, answer);
  expect(answer).toMatchObject({ peerSawEnd: true, closeArrived: true });
});

test('a server end never reaches a client that does not read: no end, no close', async () => {
  const answer = await endAnswerOf('server', false);
  recordAnswer(ENDPOINT_CALL_SHAPES.SERVER_END_THE_CLIENT_DID_NOT_READ, answer);
  expect(answer).toMatchObject({ peerSawEnd: false, closeArrived: false });
});

test.each([
  ['server', true, ENDPOINT_CALL_SHAPES.SERVER_DESTROY_THE_CLIENT_READ],
  ['server', false, ENDPOINT_CALL_SHAPES.SERVER_DESTROY_THE_CLIENT_DID_NOT_READ],
  ['client', true, ENDPOINT_CALL_SHAPES.CLIENT_DESTROY_THE_SERVER_READ],
  ['client', false, ENDPOINT_CALL_SHAPES.CLIENT_DESTROY_THE_SERVER_DID_NOT_READ],
] as const)('a %s destroy closes the peer, reading %p, as the platform answers it', async (destroyingSide, peerReads, callShape) => {
  const answer = await destroyAnswerOf(destroyingSide, peerReads);
  recordAnswer(callShape, answer);
  expect(typeof answer.closeArrived).toBe('boolean');
});

test.each([
  ['server', false, ENDPOINT_CALL_SHAPES.SERVER_DESTROY_WITH_DATA_THE_CLIENT_DID_NOT_READ],
  ['server', true, ENDPOINT_CALL_SHAPES.SERVER_DESTROY_WITH_DATA_THE_CLIENT_DID_NOT_READ_AND_LISTENS_FOR_ERRORS],
  ['client', false, ENDPOINT_CALL_SHAPES.CLIENT_DESTROY_WITH_DATA_THE_SERVER_DID_NOT_READ],
  ['client', true, ENDPOINT_CALL_SHAPES.CLIENT_DESTROY_WITH_DATA_THE_SERVER_DID_NOT_READ_AND_LISTENS_FOR_ERRORS],
] as const)('a %s destroy after a write gives the peer that reads only later, listening for errors %p, its events in the platform\'s order', async (
  destroyingSide, peerListensForErrors, callShape
) => {
  const answer = await unreadDestroyAnswerOf(destroyingSide, peerListensForErrors);
  recordAnswer(callShape, answer);
  expect([...answer.eventsBeforeRead, ...answer.eventsAfterRead]).toContain('close');
});

test('a write after the client\'s end is an error', async () => {
  const endpoint = preparedEndpoint();
  await listenAnswerOf(endpoint, (socket) => socket.on('data', () => undefined));
  const client = await connected(endpoint);
  client.on('data', () => undefined);
  client.end();
  const startedAt = performance.now();
  const code = await new Promise<string>((resolve) => {
    client.once('error', (error: NodeJS.ErrnoException) => resolve(error.code ?? String(error)));
    client.write('example line\n');
  });
  const answer: WriteAfterEndAnswer = { code, timing: timingOf(millisecondsSince(startedAt)) };
  client.destroy();
  recordAnswer(ENDPOINT_CALL_SHAPES.WRITE_AFTER_END, answer);
  expect(answer.code).toBe('ERR_STREAM_WRITE_AFTER_END');
});
