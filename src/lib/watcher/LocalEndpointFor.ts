/** The one selector of the `LocalEndpoint` port, and the real primitives its adapters run on. */
import { chmodSync, mkdirSync, rmSync }   from 'node:fs';
import { createConnection, createServer } from 'node:net';

import type { LocalEndpoint }                                      from './LocalEndpoint.ts';
import { createPosixSocketEndpoint, type PosixEndpointPrimitives } from './PosixSocketEndpoint.ts';
import { createUnsupportedLocalEndpoint }                          from './UnsupportedLocalEndpoint.ts';

export const REAL_ENDPOINT_PRIMITIVES: PosixEndpointPrimitives = Object.freeze<PosixEndpointPrimitives>({
  createFolder: (folder, mode) => {
    mkdirSync(folder, { recursive: true, mode });
  },
  restrictFolder: (folder, mode) => chmodSync(folder, mode),
  removeFile:     (path) => rmSync(path, { force: true }),
  serverOf:       (onConnection) => createServer(onConnection),
  connectionTo:   (endpoint) => createConnection(endpoint),
});

export function localEndpointFor(platform: string): LocalEndpoint {
  if (platform === 'darwin' || platform === 'linux') return createPosixSocketEndpoint(REAL_ENDPOINT_PRIMITIVES);
  return createUnsupportedLocalEndpoint(platform);
}
