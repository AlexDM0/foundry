/** The one selector of the `LocalEndpoint` port, and the real primitives its adapters run on. */
import { rmSync }                         from 'node:fs';
import { createConnection, createServer } from 'node:net';

import { createPosixOwnerOnlyFiles, REAL_POSIX_OWNER_ONLY_PRIMITIVES } from '../owner-only-files/PosixOwnerOnlyFiles.ts';
import type { LocalEndpoint }                                          from './LocalEndpoint.ts';
import { createPosixSocketEndpoint, type PosixEndpointPrimitives }     from './PosixSocketEndpoint.ts';
import { createUnsupportedLocalEndpoint }                              from './UnsupportedLocalEndpoint.ts';

export const REAL_ENDPOINT_PRIMITIVES: PosixEndpointPrimitives = Object.freeze<PosixEndpointPrimitives>({
  restrictFolder: (folder) => createPosixOwnerOnlyFiles(REAL_POSIX_OWNER_ONLY_PRIMITIVES).restrictFolder(folder),
  removeFile:     (path) => rmSync(path, { force: true }),
  serverOf:       (onConnection) => createServer(onConnection),
  connectionTo:   (endpoint) => createConnection(endpoint),
});

export function localEndpointFor(platform: string): LocalEndpoint {
  if (platform === 'darwin' || platform === 'linux') return createPosixSocketEndpoint(REAL_ENDPOINT_PRIMITIVES);
  return createUnsupportedLocalEndpoint(platform);
}
