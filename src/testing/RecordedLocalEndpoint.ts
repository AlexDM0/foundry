/**
 * The Watcher socket of a default spec: `useRecordedLocalEndpoint` gives a `LocalEndpoint` whose servers and connections live in memory and
 * answer with what the real socket or pipe answered, which `src/lib/watcher/LocalEndpoint.answers.integration.spec.ts` records under
 * `bun run record src/lib/watcher/LocalEndpointFor.ts`. A call with no recorded answer fails the case. The mock refuses what the real socket
 * refuses: the end of a connection reaches no client that did not read it, a write after `end` is an error, and a removed path refuses a
 * connect. A destroy gives its peer the recorded end and close, also when the peer does not read.
 */
import { EventEmitter }             from 'node:events';
import { existsSync, readFileSync } from 'node:fs';
import type { Server, Socket }      from 'node:net';
import { join }                     from 'node:path';

import { afterEach } from 'bun:test';

import type { LocalEndpoint }               from '../lib/watcher/LocalEndpoint.ts';
import { localEndpointFor }                 from '../lib/watcher/LocalEndpointFor.ts';
import type { BoundaryRecording }           from './BoundaryRecordings.ts';
import { recordCommandOf, recordingPathOf } from './BoundaryRecordings.ts';

const LOCAL_ENDPOINT_BOUNDARY = 'src/lib/watcher/LocalEndpointFor.ts';
const REPOSITORY_ROOT = join(import.meta.dir, '..', '..');
const PIPE_NAME_PREFIX = 'example-product';
/** A real answer that takes longer than this is recorded as one given after a wait. */
export const AT_ONCE_LIMIT_MILLISECONDS = 500;

/** The call shapes the boundary spec records, each named for what the real socket or pipe was asked and in which state. */
export const ENDPOINT_CALL_SHAPES = {
  LISTEN_ON_A_FREE_PATH:                  'listen <endpoint>, nobody listens there',
  LISTEN_ON_A_TAKEN_PATH:                 'listen <endpoint>, another server listens there',
  LISTEN_ON_A_PATH_TOO_LONG:              'listen <endpoint longer than the platform keeps>',
  CONNECT_TO_A_LISTENER:                  'connect <endpoint>, a server listens there',
  CONNECT_WITH_NO_LISTENER:               'connect <endpoint>, nothing was ever bound there',
  CONNECT_TO_A_STALE_SOCKET:              'connect <endpoint>, what a listener killed while listening left',
  CONNECT_TO_A_REMOVED_PATH:              'connect <endpoint>, released while its server listens',
  HELLO_WITH_A_BAD_SECRET:                'hello with another secret, to a Watcher socket',
  HELLO_WITH_THE_SECRET:                  'hello with the secret, to a Watcher socket',
  CLIENT_HALF_CLOSE:                      'end <client connection>, the server reads',
  SERVER_END_THE_CLIENT_DID_NOT_READ:     'end <server connection>, the client never reads',
  SERVER_END_THE_CLIENT_READ:             'end <server connection>, the client reads',
  WRITE_AFTER_END:                        'write <client connection> after its end',
  SERVER_DESTROY_THE_CLIENT_READ:         'destroy <server connection>, the client reads',
  SERVER_DESTROY_THE_CLIENT_DID_NOT_READ: 'destroy <server connection>, the client never reads',
  CLIENT_DESTROY_THE_SERVER_READ:         'destroy <client connection>, the server reads',
  CLIENT_DESTROY_THE_SERVER_DID_NOT_READ: 'destroy <client connection>, the server never reads',
} as const;

export type EndpointCallShape = typeof ENDPOINT_CALL_SHAPES[keyof typeof ENDPOINT_CALL_SHAPES];

export type EndpointTiming = 'at once' | 'after a wait';

export type ListenAnswer =
  | { readonly outcome: 'listening'; readonly timing: EndpointTiming }
  | { readonly outcome: 'error'; readonly code: string; readonly timing: EndpointTiming };

export type ConnectAnswer =
  | { readonly outcome: 'connected'; readonly timing: EndpointTiming }
  | { readonly outcome: 'error'; readonly code: string; readonly timing: EndpointTiming };

/** What a client sees of a Watcher socket's answer to its `hello`: the frames, and whether the end and the close reached it. */
export interface HelloAnswer {
  readonly frames:       readonly unknown[];
  readonly endArrived:   boolean;
  readonly closeArrived: boolean;
  readonly timing:       EndpointTiming;
}

/** What each side sees when one side ends a connection. */
export interface EndAnswer {
  readonly peerSawEnd:      boolean;
  readonly peerEndedInTurn: boolean;
  readonly closeArrived:    boolean;
  readonly timing:          EndpointTiming;
}

/** What the peer sees when the other side destroys the connection. */
export interface DestroyAnswer {
  readonly peerSawEnd:   boolean;
  readonly closeArrived: boolean;
  readonly timing:       EndpointTiming;
}

export interface WriteAfterEndAnswer {
  readonly code:   string;
  readonly timing: EndpointTiming;
}

export function timingOf(elapsedMilliseconds: number): EndpointTiming {
  return elapsedMilliseconds < AT_ONCE_LIMIT_MILLISECONDS ? 'at once' : 'after a wait';
}

let recordedAnswers: ReadonlyMap<string, unknown> | null = null;

function recordedAnswersOfThisOs(): ReadonlyMap<string, unknown> {
  if (recordedAnswers !== null) return recordedAnswers;
  const recordingPath = join(REPOSITORY_ROOT, recordingPathOf(LOCAL_ENDPOINT_BOUNDARY, process.platform));
  if (!existsSync(recordingPath)) {
    throw new Error(`no local endpoint answers are recorded for ${process.platform}: run \`${recordCommandOf(LOCAL_ENDPOINT_BOUNDARY)}\`.`);
  }
  const recording = JSON.parse(readFileSync(recordingPath, 'utf8')) as BoundaryRecording;
  recordedAnswers = new Map(recording.answers.map(({ callShape, answer }) => [callShape, answer]));
  return recordedAnswers;
}

/** The recorded answer to one call shape on this OS; `undefined` when nobody recorded it. */
export function recordedEndpointAnswerOf(callShape: EndpointCallShape): unknown {
  return recordedAnswersOfThisOs().get(callShape);
}

export interface RecordedLocalEndpoint {
  /** The endpoint each Watcher and client of the spec binds and connects through; its names and limits are the platform's own. */
  readonly endpoint:            LocalEndpoint;
  /** The listener of the endpoint dies with no close, so what it leaves refuses a connect until a prepare or a release. */
  readonly killListener:        (endpoint: string) => void;
  /** Each call that had no recorded answer since the last take, described; the list is then empty. */
  readonly takeUnansweredCalls: () => string[];
}

interface MockedConnectionSide {
  readonly socket: EventEmitter;
  peer:            MockedConnectionSide | null;
  encoding:        BufferEncoding | null;
  unreadChunks:    string[];
  ownEndSent:      boolean;
  peerEndPending:  boolean;
  endEmitted:      boolean;
  closed:          boolean;
}

/** Call at a spec file's top level: a call the mock could not answer fails the case. */
export function useRecordedLocalEndpoint(): RecordedLocalEndpoint {
  const recorded = createRecordedLocalEndpoint();
  afterEach(() => {
    // Production code may catch the error of an unanswered call, so the case fails here too.
    const unanswered = recorded.takeUnansweredCalls();
    if (unanswered.length > 0) throw new Error(unanswered.join('\n'));
  });
  return recorded;
}

/** `answers` are this OS's recording unless a spec of the mock itself gives others. */
export function createRecordedLocalEndpoint(answers: ReadonlyMap<string, unknown> = recordedAnswersOfThisOs()): RecordedLocalEndpoint {
  const platformEndpoint = localEndpointFor(process.platform, PIPE_NAME_PREFIX);
  const listeners = new Map<string, (socket: Socket) => void>();
  const staleEndpoints = new Set<string>();
  const removedEndpoints = new Set<string>();
  const unansweredCalls: string[] = [];

  const answerOf = <Answer>(callShape: EndpointCallShape): Answer => {
    const answer = answers.get(callShape);
    if (answer === undefined) {
      const unanswered = `${callShape} has no recorded answer: run \`${recordCommandOf(LOCAL_ENDPOINT_BOUNDARY)}\``;
      unansweredCalls.push(unanswered);
      throw new Error(unanswered);
    }
    return answer as Answer;
  };
  const later = (timing: EndpointTiming, action: () => void): void => {
    if (timing === 'at once') queueMicrotask(action);
    else setImmediate(action);
  };
  const errorOf = (code: string, call: string): Error => Object.assign(new Error(`${call} ${code}`), { code });

  const closeSide = (side: MockedConnectionSide): void => {
    if (side.closed) return;
    side.closed = true;
    // A real socket emits `close` on a later tick, never inside the `destroy` or `end` that caused it.
    process.nextTick(() => side.socket.emit('close', false));
  };
  const deliverUnread = (side: MockedConnectionSide): void => {
    while (side.unreadChunks.length > 0) {
      const chunk = side.unreadChunks.shift() ?? '';
      side.socket.emit('data', side.encoding === null ? Buffer.from(chunk, 'utf8') : chunk);
    }
  };
  const isReading = (side: MockedConnectionSide): boolean => side.socket.listenerCount('data') > 0;

  // The end of the peer reaches this side only once it read all before it, as on a real socket a paused one never sees its end or close.
  const settlePeerEnd = (side: MockedConnectionSide, endedByClient: boolean): void => {
    if (!side.peerEndPending || side.endEmitted || side.closed) return;
    const endAnswer = endAnswerFor(side, endedByClient);
    if (!isReading(side) && !endAnswer.closeArrived) return;
    deliverUnread(side);
    side.endEmitted = true;
    if (endAnswer.peerSawEnd) side.socket.emit('end');
    if (endAnswer.peerEndedInTurn && !side.ownEndSent) endSide(side, '');
    if (side.ownEndSent) closeSide(side);
  };

  /** What the receiving side sees of its peer's end, read when the end reaches it, so a client that reads later gets the reading answer. */
  function endAnswerFor(receivingSide: MockedConnectionSide, endedByClient: boolean): EndAnswer {
    if (endedByClient) return answerOf<EndAnswer>(ENDPOINT_CALL_SHAPES.CLIENT_HALF_CLOSE);
    return answerOf<EndAnswer>(isReading(receivingSide)
      ? ENDPOINT_CALL_SHAPES.SERVER_END_THE_CLIENT_READ
      : ENDPOINT_CALL_SHAPES.SERVER_END_THE_CLIENT_DID_NOT_READ);
  }

  const clientSides = new WeakSet<MockedConnectionSide>();

  function endSide(side: MockedConnectionSide, text: string): void {
    if (side.ownEndSent) return;
    if (text !== '') writeSide(side, text);
    side.ownEndSent = true;
    const { peer } = side;
    if (peer === null) return;
    const endedByClient = clientSides.has(side);
    peer.peerEndPending = true;
    later(endAnswerFor(peer, endedByClient).timing, () => settlePeerEnd(peer, endedByClient));
    // A side that reads later gets the end then, as a real socket resumed from its pause.
    peer.socket.on('newListener', (event: string) => {
      if (event === 'data') queueMicrotask(() => settlePeerEnd(peer, endedByClient));
    });
  }

  /** What the peer sees of a destroy, read at the destroy, since a real peer gets it whether it reads or not. */
  function destroyAnswerFor(peer: MockedConnectionSide, destroyedByClient: boolean): DestroyAnswer {
    const peerReads = isReading(peer);
    if (destroyedByClient) {
      return answerOf<DestroyAnswer>(peerReads
        ? ENDPOINT_CALL_SHAPES.CLIENT_DESTROY_THE_SERVER_READ
        : ENDPOINT_CALL_SHAPES.CLIENT_DESTROY_THE_SERVER_DID_NOT_READ);
    }
    return answerOf<DestroyAnswer>(peerReads
      ? ENDPOINT_CALL_SHAPES.SERVER_DESTROY_THE_CLIENT_READ
      : ENDPOINT_CALL_SHAPES.SERVER_DESTROY_THE_CLIENT_DID_NOT_READ);
  }

  function destroySide(side: MockedConnectionSide): void {
    if (side.closed) return;
    closeSide(side);
    const { peer } = side;
    if (peer === null || peer.closed) return;
    const destroyAnswer = destroyAnswerFor(peer, clientSides.has(side));
    later(destroyAnswer.timing, () => {
      if (peer.closed) return;
      if (isReading(peer)) deliverUnread(peer);
      if (destroyAnswer.peerSawEnd && !peer.endEmitted) {
        peer.endEmitted = true;
        peer.socket.emit('end');
      }
      if (destroyAnswer.closeArrived) closeSide(peer);
    });
  }

  function writeSide(side: MockedConnectionSide, text: string): boolean {
    if (side.ownEndSent || side.closed) {
      const writeAnswer = answerOf<WriteAfterEndAnswer>(ENDPOINT_CALL_SHAPES.WRITE_AFTER_END);
      later(writeAnswer.timing, () => side.socket.emit('error', errorOf(writeAnswer.code, 'write')));
      return false;
    }
    const { peer } = side;
    if (peer === null || peer.closed) return false;
    peer.unreadChunks.push(text);
    queueMicrotask(() => {
      if (isReading(peer)) deliverUnread(peer);
    });
    return true;
  }

  function mockedSocket(): MockedConnectionSide {
    const socket = new EventEmitter();
    const side: MockedConnectionSide = {
      socket, peer: null, encoding: null, unreadChunks: [], ownEndSent: false, peerEndPending: false, endEmitted: false, closed: false,
    };
    socket.on('newListener', (event: string) => {
      if (event === 'data') queueMicrotask(() => deliverUnread(side));
    });
    Object.assign(socket, {
      setEncoding: (encoding: BufferEncoding) => {
        side.encoding = encoding;
        return socket;
      },
      write: (chunk: string | Uint8Array) => writeSide(side, typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8')),
      end:   (chunk?: string | Uint8Array) => {
        if (side.ownEndSent && chunk !== undefined && chunk !== '') {
          writeSide(side, typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8'));
          return socket;
        }
        endSide(side, chunk === undefined ? '' : typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8'));
        return socket;
      },
      destroy: () => {
        destroySide(side);
        return socket;
      },
    });
    return side;
  }

  const connectionTo = (endpoint: string): Socket => {
    const client = mockedSocket();
    clientSides.add(client);
    const listener = listeners.get(endpoint);
    let callShape: EndpointCallShape = ENDPOINT_CALL_SHAPES.CONNECT_WITH_NO_LISTENER;
    if (removedEndpoints.has(endpoint)) callShape = ENDPOINT_CALL_SHAPES.CONNECT_TO_A_REMOVED_PATH;
    else if (staleEndpoints.has(endpoint)) callShape = ENDPOINT_CALL_SHAPES.CONNECT_TO_A_STALE_SOCKET;
    else if (listener !== undefined) callShape = ENDPOINT_CALL_SHAPES.CONNECT_TO_A_LISTENER;
    const connectAnswer = answerOf<ConnectAnswer>(callShape);
    later(connectAnswer.timing, () => {
      if (connectAnswer.outcome === 'error' || listener === undefined) {
        client.socket.emit('error', errorOf(connectAnswer.outcome === 'error' ? connectAnswer.code : 'ECONNREFUSED', 'connect'));
        closeSide(client);
        return;
      }
      const served = mockedSocket();
      served.peer = client;
      client.peer = served;
      listener(served.socket as unknown as Socket);
      client.socket.emit('connect');
    });
    return client.socket as unknown as Socket;
  };

  const serverOf = (onConnection: (socket: Socket) => void): Server => {
    const server = new EventEmitter();
    let boundEndpoint: string | null = null;
    return Object.assign(server, {
      listen: (endpoint: string, onListening?: () => void) => {
        let callShape: EndpointCallShape = ENDPOINT_CALL_SHAPES.LISTEN_ON_A_FREE_PATH;
        if (!platformEndpoint.endpointFits(endpoint)) callShape = ENDPOINT_CALL_SHAPES.LISTEN_ON_A_PATH_TOO_LONG;
        else if ((listeners.has(endpoint) && !removedEndpoints.has(endpoint)) || staleEndpoints.has(endpoint)) callShape = ENDPOINT_CALL_SHAPES.LISTEN_ON_A_TAKEN_PATH;
        const listenAnswer = answerOf<ListenAnswer>(callShape);
        if (listenAnswer.outcome === 'listening') {
          listeners.set(endpoint, onConnection);
          removedEndpoints.delete(endpoint);
          boundEndpoint = endpoint;
        }
        later(listenAnswer.timing, () => {
          if (listenAnswer.outcome === 'error') server.emit('error', errorOf(listenAnswer.code, 'listen'));
          else onListening?.();
        });
        return server;
      },
      close: (onClosed?: () => void) => {
        if (boundEndpoint !== null && listeners.get(boundEndpoint) === onConnection) listeners.delete(boundEndpoint);
        boundEndpoint = null;
        queueMicrotask(() => {
          server.emit('close');
          onClosed?.();
        });
        return server;
      },
    }) as unknown as Server;
  };

  const forgetEndpoint = (endpoint: string): void => {
    staleEndpoints.delete(endpoint);
    if (listeners.has(endpoint)) removedEndpoints.add(endpoint);
  };

  return {
    endpoint: Object.freeze<LocalEndpoint>({
      endpointOf:      platformEndpoint.endpointOf,
      endpointFits:    platformEndpoint.endpointFits,
      prepareEndpoint: (endpoint) => {
        forgetEndpoint(endpoint);
        return { verdict: 'done' };
      },
      releaseEndpoint: (endpoint) => {
        forgetEndpoint(endpoint);
        return { verdict: 'done' };
      },
      serverOf,
      connectionTo,
    }),
    killListener: (endpoint) => {
      if (!listeners.delete(endpoint)) return;
      staleEndpoints.add(endpoint);
    },
    takeUnansweredCalls: () => unansweredCalls.splice(0),
  };
}
