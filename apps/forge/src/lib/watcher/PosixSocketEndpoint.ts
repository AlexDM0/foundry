/**
 * Where a Watcher instance listens on macOS and Linux: `<monitor folder>/watchers/<first 16 hex of sha256(trackerId, jobId, instance)>.sock`, one
 * path per instance so a lingering ended Watcher never holds its successor's, and short enough for the bytes the system keeps for a socket path.
 */
import { createHash }               from 'node:crypto';
import { type Server, type Socket } from 'node:net';
import { dirname, join }            from 'node:path';

import type { EndpointOutcome, LocalEndpoint } from './LocalEndpoint.ts';
import { WATCHER_FOLDER_NAME }                 from './constants/WatcherProtocol.ts';

export interface PosixEndpointPrimitives {
  /** Creates the folder when it is absent; the `OwnerOnlyFiles` port's. */
  readonly restrictFolder: (folder: string) => void;
  readonly removeFile:     (path: string) => void;
  readonly serverOf:       (onConnection: (socket: Socket) => void) => Server;
  readonly connectionTo:   (endpoint: string) => Socket;
}

/** macOS keeps 104 bytes for a socket path, its terminating zero byte included. */
export const MACOS_SOCKET_PATH_LIMIT_BYTES = 104;
/** Linux keeps 108 bytes for a socket path, its terminating zero byte included. */
export const LINUX_SOCKET_PATH_LIMIT_BYTES = 108;

const WATCHER_SOCKET_NAME_HEX_DIGITS = 16;

function outcomeOf(attempt: () => void): EndpointOutcome {
  try {
    attempt();
    return { verdict: 'done' };
  } catch (error) {
    return { verdict: 'refused', reason: String(error) };
  }
}

export function createPosixSocketEndpoint(primitives: PosixEndpointPrimitives, socketPathLimitBytes: number): LocalEndpoint {
  return Object.freeze<LocalEndpoint>({
    endpointOf: ({
      monitorFolder, trackerId, jobId, instance
    }) => {
      const digest = createHash('sha256').update(`${trackerId}\n${jobId}\n${instance}`).digest('hex');
      return join(monitorFolder, WATCHER_FOLDER_NAME, `${digest.slice(0, WATCHER_SOCKET_NAME_HEX_DIGITS)}.sock`);
    },
    // The limit counts the terminating zero byte, so the longest bindable path is one byte shorter.
    endpointFits:    (endpoint) => Buffer.byteLength(endpoint, 'utf8') < socketPathLimitBytes,
    prepareEndpoint: (endpoint) => outcomeOf(() => {
      primitives.restrictFolder(dirname(endpoint));
      primitives.removeFile(endpoint);
    }),
    releaseEndpoint: (endpoint) => outcomeOf(() => primitives.removeFile(endpoint)),
    serverOf:        primitives.serverOf,
    connectionTo:    primitives.connectionTo,
  });
}
