/**
 * Talos's endpoint: a connection's first line is read by `helloFrameOf` alone and answered by a frozen frame or `welcome`; a welcomed
 * connection then sends client frames, each answered by exactly one `done`, and receives every broadcast `state` frame. The secret is
 * checked before the version, so nobody without it can make Talos quit.
 */
import { timingSafeEqual }     from 'node:crypto';
import type { Server, Socket } from 'node:net';

import type {
  DoneFrame,
  ReceivedClientFrame,
  RefusedFrame,
  StateFrame,
  WelcomeFrame
} from '../src/domain/talos/@types/TalosFrame.ts';
import {
  clientFrameOf,
  helloFrameOf,
  refusedFrameOf,
  talosFrameLineOf,
  versionMismatchFrameOf
} from '../src/domain/talos/TalosFrames.ts';
import { TALOS_CLIENT_LINE_LIMIT_CHARACTERS, TALOS_PROTOCOL_VERSION } from '../src/domain/talos/constants/TalosProtocol.ts';

const LINE_SEPARATOR = '\n';

export interface TalosSocketOptions {
  /** A server not yet listening, as the `LocalEndpoint` port gives one; its `listen` takes the endpoint. */
  readonly serverOf:          (onConnection: (socket: Socket) => void) => Server;
  readonly endpoint:          string;
  readonly secret:            string;
  readonly isQuitting:        () => boolean;
  readonly welcomeOf:         () => WelcomeFrame;
  /** Called once the `version-mismatch` answer is written; Talos then quits cleanly. */
  readonly onVersionMismatch: () => void;
  /** Answers one client frame; a `refused` verdict is an answer too. */
  readonly onClientFrame:     (frame: ReceivedClientFrame) => Promise<DoneFrame>;
}

export interface TalosSocketServer {
  readonly broadcast: (frame: StateFrame) => void;
  /** Stops listening and ends every connection; the endpoint itself is released by its owner. */
  readonly close:     () => void;
}

export type TalosSocketListening =
  | { readonly verdict: 'listening'; readonly server: TalosSocketServer }
  /** `systemError` is the operating system's own message for the failed bind. */
  | { readonly verdict: 'unbindable'; readonly systemError: string };

function secretsMatch(offered: string, expected: string): boolean {
  const offeredBytes = Buffer.from(offered, 'utf8');
  const expectedBytes = Buffer.from(expected, 'utf8');
  return offeredBytes.length === expectedBytes.length && timingSafeEqual(offeredBytes, expectedBytes);
}

function serveConnection(socket: Socket, options: TalosSocketOptions, welcomedConnections: Set<Socket>): void {
  let pending = '';
  let answeredFirstLine = false;
  let connectionIsOver = false;
  let connectionIsClosed = false;
  const endWith = (frame: RefusedFrame | ReturnType<typeof versionMismatchFrameOf>): void => {
    connectionIsOver = true;
    pending = '';
    socket.end(talosFrameLineOf(frame));
  };
  const consumeFirstLine = (line: string): void => {
    answeredFirstLine = true;
    const hello = helloFrameOf(line);
    if (hello === null) {
      endWith(refusedFrameOf('malformed'));
      return;
    }
    if (!secretsMatch(hello.secret, options.secret)) {
      endWith(refusedFrameOf('secret'));
      return;
    }
    if (options.isQuitting()) {
      endWith(refusedFrameOf('quitting'));
      return;
    }
    if (hello.requiredProtocolVersion !== TALOS_PROTOCOL_VERSION) {
      endWith(versionMismatchFrameOf(TALOS_PROTOCOL_VERSION));
      options.onVersionMismatch();
      return;
    }
    socket.write(talosFrameLineOf(options.welcomeOf()));
    welcomedConnections.add(socket);
  };
  const consumeFrameLine = (line: string): void => {
    const frame = clientFrameOf(line);
    // A line that is no frame carries no frameId a `done` could answer, so it goes unanswered.
    if (frame === null) return;
    void options.onClientFrame(frame).then((done) => {
      if (!connectionIsClosed) socket.write(talosFrameLineOf(done));
    });
  };
  socket.setEncoding('utf8');
  // Every connection reads its data, so the end of one that stops sending still reaches `close`.
  socket.on('data', (chunk: string) => {
    if (connectionIsOver) return;
    pending += chunk;
    let separatorIndex = pending.indexOf(LINE_SEPARATOR);
    while (separatorIndex !== -1 && !connectionIsOver) {
      const line = pending.slice(0, separatorIndex);
      pending = pending.slice(separatorIndex + 1);
      if (answeredFirstLine) consumeFrameLine(line);
      else consumeFirstLine(line);
      separatorIndex = pending.indexOf(LINE_SEPARATOR);
    }
    if (connectionIsOver || pending.length <= TALOS_CLIENT_LINE_LIMIT_CHARACTERS) return;
    if (answeredFirstLine) {
      connectionIsOver = true;
      welcomedConnections.delete(socket);
      socket.destroy();
      return;
    }
    endWith(refusedFrameOf('malformed'));
  });
  socket.on('close', () => {
    connectionIsClosed = true;
    welcomedConnections.delete(socket);
  });
  socket.on('error', () => welcomedConnections.delete(socket));
}

export async function listenOnTalosSocket(options: TalosSocketOptions): Promise<TalosSocketListening> {
  const welcomedConnections = new Set<Socket>();
  const openConnections = new Set<Socket>();
  const server = options.serverOf((socket) => {
    openConnections.add(socket);
    socket.on('close', () => openConnections.delete(socket));
    serveConnection(socket, options, welcomedConnections);
  });
  const bindError = await new Promise<Error | null>((resolve) => {
    server.once('error', resolve);
    server.listen(options.endpoint, () => resolve(null));
  });
  if (bindError !== null) return { verdict: 'unbindable', systemError: String(bindError) };
  return {
    verdict: 'listening',
    server:  {
      broadcast: (frame) => {
        const line = talosFrameLineOf(frame);
        for (const connection of welcomedConnections) connection.write(line);
      },
      close: () => {
        server.close();
        for (const connection of openConnections) connection.end();
      },
    },
  };
}
