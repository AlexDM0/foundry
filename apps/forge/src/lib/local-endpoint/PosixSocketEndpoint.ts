/**
 * Where an endpoint listens on macOS and Linux: `<socket folder>/<first 16 hex of sha256(scope, name, instance)>.sock`, one
 * path per instance so a lingering ended instance never holds its successor's, and short enough for the bytes the system keeps for a socket path.
 */
import { createHash }               from 'node:crypto';
import { type Server, type Socket } from 'node:net';
import { dirname, join }            from 'node:path';

import type { OwnerOnlyRestriction }           from '../owner-only-files/OwnerOnlyFiles.ts';
import type { EndpointOutcome, LocalEndpoint } from './LocalEndpoint.ts';

export interface PosixEndpointPrimitives {
  /** Creates the folder when it is absent; the `OwnerOnlyFiles` port's. */
  readonly restrictFolder: (folder: string) => OwnerOnlyRestriction;
  readonly removeFile:     (path: string) => void;
  readonly serverOf:       (onConnection: (socket: Socket) => void) => Server;
  readonly connectionTo:   (endpoint: string) => Socket;
}

/** macOS keeps 104 bytes for a socket path, its terminating zero byte included. */
export const MACOS_SOCKET_PATH_LIMIT_BYTES = 104;
/** Linux keeps 108 bytes for a socket path, its terminating zero byte included. */
export const LINUX_SOCKET_PATH_LIMIT_BYTES = 108;

const SOCKET_NAME_HEX_DIGITS = 16;

/** An attempt answers its own refusal, or `null` when it is done; a system error it throws is a refusal too. */
function outcomeOf(attempt: () => EndpointOutcome | null): EndpointOutcome {
  try {
    return attempt() ?? { verdict: 'done' };
  } catch (error) {
    return { verdict: 'refused', refusal: { cause: 'system-error', systemError: String(error) } };
  }
}

function restrictionRefusalOf(restriction: OwnerOnlyRestriction): EndpointOutcome | null {
  return restriction.verdict === 'refused'
    ? { verdict: 'refused', refusal: { cause: 'folder-not-private', restrictionCause: restriction.cause, path: restriction.path } }
    : null;
}

export function createPosixSocketEndpoint(primitives: PosixEndpointPrimitives, socketPathLimitBytes: number): LocalEndpoint {
  return Object.freeze<LocalEndpoint>({
    endpointOf: ({
      socketFolder, scope, name, instance
    }) => {
      const digest = createHash('sha256').update(`${scope}\n${name}\n${instance}`).digest('hex');
      return join(socketFolder, `${digest.slice(0, SOCKET_NAME_HEX_DIGITS)}.sock`);
    },
    // The limit counts the terminating zero byte, so the longest bindable path is one byte shorter.
    endpointFits:    (endpoint) => Buffer.byteLength(endpoint, 'utf8') < socketPathLimitBytes,
    prepareEndpoint: (endpoint) => outcomeOf(() => {
      const refusal = restrictionRefusalOf(primitives.restrictFolder(dirname(endpoint)));
      if (refusal === null) primitives.removeFile(endpoint);
      return refusal;
    }),
    releaseEndpoint: (endpoint) => outcomeOf(() => {
      primitives.removeFile(endpoint);
      return null;
    }),
    serverOf:     primitives.serverOf,
    connectionTo: primitives.connectionTo,
  });
}
