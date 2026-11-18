/**
 * The answer for a platform with no adapter yet: no endpoint exists, nothing fits and a prepare refuses, so a Watcher records `launch-unreadable`
 * rather than guessing a shape. A connect is the portable call, and fails on the empty endpoint as on any gone one.
 */
import { createConnection, createServer } from 'node:net';

import type { LocalEndpoint } from './LocalEndpoint.ts';

export function createUnsupportedLocalEndpoint(platform: string): LocalEndpoint {
  const refusal = { verdict: 'refused', reason: `no local endpoint exists for the platform ${platform}` } as const;
  return Object.freeze<LocalEndpoint>({
    endpointOf:      () => '',
    endpointFits:    () => false,
    prepareEndpoint: () => refusal,
    releaseEndpoint: () => refusal,
    serverOf:        (onConnection) => createServer(onConnection),
    connectionTo:    (endpoint) => createConnection(endpoint),
  });
}
