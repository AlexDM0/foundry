/**
 * A Talos protocol client for specs that spawn the Talos binary: it connects once Talos has bound its endpoint, sends raw lines or frames,
 * and waits for a received frame by predicate or for Talos to close the connection. Test-only.
 */
import { type Socket } from 'node:net';

import type { TalosFrame }     from '../domain/talos/@types/TalosFrame.ts';
import { nativePlatformPorts } from './NativePlatformPorts.ts';
import { firstValueOf }        from './WaitUntil.ts';

export interface TalosProtocolClient {
  /** A string goes as it is, so a spec can send a line that is no frame; anything else is sent as one JSON line. */
  readonly send:      (frame: string | object) => void;
  /**
   * Resolves with the first frame received, earlier or later, that matches and was not returned before; rejects once Talos closed the
   * connection without one, or after the wait budget of `src/testing/WaitUntil.ts`.
   */
  readonly nextFrame: (matches: (frame: TalosFrame) => boolean) => Promise<TalosFrame>;
  readonly received:  () => readonly TalosFrame[];
  /** Resolves once Talos has closed the connection. */
  readonly closed:    Promise<void>;
  readonly close:     () => void;
}

function connectOnce(endpoint: string): Promise<Socket | undefined> {
  return new Promise((resolve) => {
    const socket = nativePlatformPorts().localEndpoint.connectionTo(endpoint);
    socket.once('connect', () => resolve(socket));
    socket.once('error', () => resolve(undefined));
  });
}

export async function connectProtocolClientToTalos(endpoint: string): Promise<TalosProtocolClient> {
  const connected = await firstValueOf(() => connectOnce(endpoint), `a Talos listening on ${endpoint}`);
  const frames: TalosFrame[] = [];
  const consumed = new Set<TalosFrame>();
  const waiters: { matches: (frame: TalosFrame) => boolean; resolve: (frame: TalosFrame) => void }[] = [];
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
    for (const line of lines) frames.push(JSON.parse(line) as TalosFrame);
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
  const receivedSoFar = (): string => frames.map((frame) => JSON.stringify(frame)).join(', ') || 'nothing';
  return {
    send: (frame) => {
      connected.write(`${typeof frame === 'string' ? frame : JSON.stringify(frame)}\n`);
    },
    nextFrame: (matches) => {
      let found: TalosFrame | undefined;
      waiters.push({
        matches,
        resolve: (frame) => {
          found = frame;
        },
      });
      settleWaiters();
      // Bounded, and refused once Talos closed the connection, so a Talos that died or stalled fails the case with what it sent.
      return firstValueOf(() => {
        if (found === undefined && connectionClosed) throw new Error(`Talos closed the connection before the frame came; received: ${receivedSoFar()}`);
        return found;
      }, () => `a matching Talos frame; received: ${receivedSoFar()}`);
    },
    received: () => [...frames],
    closed,
    close:    () => {
      connected.destroy();
    },
  };
}
