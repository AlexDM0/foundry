/**
 * Where a Watcher instance listens on Windows: a named pipe `\\.\pipe\<prefix>-<random hex>`, drawn afresh for each launch and kept in its launch
 * file, so nobody can take the name ahead of the bind. A pipe has no folder, no mode and no file to clear, and the system frees its name with its
 * last handle. libuv binds as the first instance, so a taken name fails the listen with `EADDRINUSE`.
 */
import { type Server, type Socket } from 'node:net';

import type { LocalEndpoint } from './LocalEndpoint.ts';

export interface WindowsPipePrimitives {
  readonly randomHexOf:  (byteCount: number) => string;
  readonly serverOf:     (onConnection: (socket: Socket) => void) => Server;
  readonly connectionTo: (endpoint: string) => Socket;
}

/** Nothing restricts who may open a pipe, as Bun's listen has no permission step: the random name and each `hello`'s secret guard it. */
export const WINDOWS_PIPE_ACCESS = 'secret-guarded';

const WINDOWS_PIPE_NAMESPACE = '\\\\.\\pipe\\';
const WINDOWS_PIPE_NAME_RANDOM_BYTES = 16;
/** Windows keeps 256 characters for a pipe name, its namespace included. */
const WINDOWS_PIPE_NAME_LIMIT_CHARACTERS = 256;

export function createWindowsPipeEndpoint(primitives: WindowsPipePrimitives, pipeNamePrefix: string): LocalEndpoint {
  return Object.freeze<LocalEndpoint>({
    endpointOf:      () => `${WINDOWS_PIPE_NAMESPACE}${pipeNamePrefix}-${primitives.randomHexOf(WINDOWS_PIPE_NAME_RANDOM_BYTES)}`,
    endpointFits:    (endpoint) => endpoint.startsWith(WINDOWS_PIPE_NAMESPACE) && endpoint.length <= WINDOWS_PIPE_NAME_LIMIT_CHARACTERS,
    prepareEndpoint: () => ({ verdict: 'done' }),
    releaseEndpoint: () => ({ verdict: 'done' }),
    serverOf:        primitives.serverOf,
    connectionTo:    primitives.connectionTo,
  });
}
