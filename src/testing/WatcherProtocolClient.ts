/**
 * A protocol 1 client for specs that spawn the Watcher binary: it connects once the Watcher has bound its socket, sends raw lines or frames, and
 * waits for a received frame by predicate or for the Watcher to close the connection. Test-only.
 */
import { type Socket } from 'node:net';

import type { WatcherFrame }   from '../lib/watcher/@types/WatcherFrame.ts';
import { nativePlatformPorts } from './NativePlatformPorts.ts';
import { firstValueOf }        from './WaitUntil.ts';

export interface WatcherProtocolClient {
  /** A string goes as it is, so a spec can send a line that is no frame; anything else is sent as one JSON line. */
  readonly send:      (frame: string | object) => void;
  /**
   * Resolves with the first frame received, earlier or later, that matches and was not returned before; rejects once the Watcher closed the
   * connection without one, or after the wait budget of `src/testing/WaitUntil.ts`.
   */
  readonly nextFrame: (matches: (frame: WatcherFrame) => boolean) => Promise<WatcherFrame>;
  readonly received:  () => readonly WatcherFrame[];
  /** Resolves once the Watcher has closed the connection. */
  readonly closed:    Promise<void>;
  readonly close:     () => void;
}

function connectOnce(socketPath: string): Promise<Socket | undefined> {
  return new Promise((resolve) => {
    const socket = nativePlatformPorts().localEndpoint.connectionTo(socketPath);
    socket.once('connect', () => resolve(socket));
    socket.once('error', () => resolve(undefined));
  });
}

/** The one proof of a freed endpoint that holds on every platform: what an endpoint is on disk, if anything, is its adapter's. */
export async function connectIsRefused(socketPath: string): Promise<boolean> {
  const socket = await connectOnce(socketPath);
  socket?.destroy();
  return socket === undefined;
}

export async function connectToWatcher(socketPath: string): Promise<WatcherProtocolClient> {
  const connected = await firstValueOf(() => connectOnce(socketPath), `a Watcher listening on ${socketPath}`);
  const frames: WatcherFrame[] = [];
  const consumed = new Set<WatcherFrame>();
  const waiters: { matches: (frame: WatcherFrame) => boolean; resolve: (frame: WatcherFrame) => void }[] = [];
  const settleWaiters = (): void => {
    for (const waiter of [...waiters]) {
      const found = frames.find((frame) => !consumed.has(frame) && waiter.matches(frame));
      if (found === undefined) continue;
      consumed.add(found);
      waiters.splice(waiters.indexOf(waiter), 1);
      waiter.resolve(found);
    }
  };
  let pending = '';
  connected.setEncoding('utf8');
  connected.on('data', (chunk: string) => {
    pending += chunk;
    const lines = pending.split('\n');
    pending = lines.pop() ?? '';
    for (const line of lines) frames.push(JSON.parse(line) as WatcherFrame);
    settleWaiters();
  });
  let connectionClosed = false;
  const closed = new Promise<void>((resolve) => {
    connected.on('close', () => {
      connectionClosed = true;
      resolve();
    });
  });
  connected.on('error', () => undefined);
  const receivedSoFar = (): string => frames.map((frame) => (frame.kind === 'state' ? `state ${frame.state}` : frame.kind)).join(', ') || 'nothing';
  return {
    send: (frame) => {
      connected.write(`${typeof frame === 'string' ? frame : JSON.stringify(frame)}\n`);
    },
    nextFrame: (matches) => {
      let found: WatcherFrame | undefined;
      waiters.push({
        matches,
        resolve: (frame) => {
          found = frame;
        }
      });
      settleWaiters();
      // Bounded, and refused once the Watcher closed the connection, so a Watcher that died or stalled fails the case with what it sent.
      return firstValueOf(() => {
        if (found === undefined && connectionClosed) throw new Error(`The Watcher closed the connection before the frame came; received: ${receivedSoFar()}`);
        return found;
      }, () => `a matching Watcher frame; received: ${receivedSoFar()}`);
    },
    received: () => [...frames],
    closed,
    close:    () => {
      connected.destroy();
    },
  };
}
