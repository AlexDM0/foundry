/**
 * A Watcher socket that accepts no frame and welcomes as an idle job, for the endpoint's specs under `src/lib/talos/`: they reach the
 * Watcher's socket server through here, so the Talos package never imports the Watcher package that imports it.
 */
import type { LocalEndpoint }                                 from '../lib/talos/LocalEndpoint.ts';
import { listenOnWatcherSocket, type WatcherSocketListening } from '../lib/watcher/WatcherSocketServer.ts';
import { WATCHER_PROTOCOL_VERSION }                           from '../lib/watcher/constants/WatcherProtocol.ts';

export type { WatcherSocketListening };

export async function listenOnIdleWatcherSocket(endpoint: LocalEndpoint, socketPath: string, watcherSecret: string): Promise<WatcherSocketListening> {
  return await listenOnWatcherSocket({
    endpoint,
    socketPath,
    watcherSecret,
    acceptedKinds:     [],
    welcomeOf:         () => ({ watcherCodeVersion: 'code-example', jobId: 'J-1', state: 'idle' }),
    durableEntries:    () => [],
    onClientLine:      () => undefined,
    onActingFrame:     () => undefined,
    onHandlingFailure: () => undefined,
  });
}

export function watcherHelloLineOf(watcherSecret: string): string {
  return `${JSON.stringify({
    kind: 'hello', protocolVersion: WATCHER_PROTOCOL_VERSION, sinceSequence: 0, watcherSecret
  })}\n`;
}
