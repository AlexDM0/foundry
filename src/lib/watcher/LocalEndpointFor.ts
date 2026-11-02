/** The one selector of the `LocalEndpoint` port, and the real primitives its adapters run on. */
import { randomBytes }                    from 'node:crypto';
import { rmSync }                         from 'node:fs';
import { createConnection, createServer } from 'node:net';

import { createPosixOwnerOnlyFiles, REAL_POSIX_OWNER_ONLY_PRIMITIVES } from '../owner-only-files/PosixOwnerOnlyFiles.ts';
import type { LocalEndpoint }                                          from './LocalEndpoint.ts';
import {
  createPosixSocketEndpoint,
  LINUX_SOCKET_PATH_LIMIT_BYTES,
  MACOS_SOCKET_PATH_LIMIT_BYTES,
  type PosixEndpointPrimitives
} from './PosixSocketEndpoint.ts';
import { createUnsupportedLocalEndpoint }                        from './UnsupportedLocalEndpoint.ts';
import { createWindowsPipeEndpoint, type WindowsPipePrimitives } from './WindowsPipeEndpoint.ts';

export const REAL_ENDPOINT_PRIMITIVES: PosixEndpointPrimitives = Object.freeze<PosixEndpointPrimitives>({
  restrictFolder: (folder) => createPosixOwnerOnlyFiles(REAL_POSIX_OWNER_ONLY_PRIMITIVES).restrictFolder(folder),
  removeFile:     (path) => rmSync(path, { force: true }),
  serverOf:       (onConnection) => createServer(onConnection),
  connectionTo:   (endpoint) => createConnection(endpoint),
});

const REAL_WINDOWS_PIPE_PRIMITIVES: WindowsPipePrimitives = Object.freeze<WindowsPipePrimitives>({
  randomHexOf:  (byteCount) => randomBytes(byteCount).toString('hex'),
  serverOf:     REAL_ENDPOINT_PRIMITIVES.serverOf,
  connectionTo: REAL_ENDPOINT_PRIMITIVES.connectionTo,
});

/** `pipeNamePrefix` starts the name of every pipe this process draws; only an adapter that draws names reads it. */
export function localEndpointFor(platform: string, pipeNamePrefix: string): LocalEndpoint {
  if (platform === 'darwin') return createPosixSocketEndpoint(REAL_ENDPOINT_PRIMITIVES, MACOS_SOCKET_PATH_LIMIT_BYTES);
  if (platform === 'linux') return createPosixSocketEndpoint(REAL_ENDPOINT_PRIMITIVES, LINUX_SOCKET_PATH_LIMIT_BYTES);
  if (platform === 'win32') return createWindowsPipeEndpoint(REAL_WINDOWS_PIPE_PRIMITIVES, pipeNamePrefix);
  return createUnsupportedLocalEndpoint(platform);
}
