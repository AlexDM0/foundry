/**
 * The extraction changed no socket path: a launch file stored before it names the same path after it, and `readWatcherLaunch` fits the same
 * lengths. `src/lib/watcher/FrozenLocalEndpoint.json` was taken from the code before the port existed; its `retake` key says how.
 */
import { expect, test } from 'bun:test';

import { FROZEN_ENDPOINT_FACTS, FROZEN_ENDPOINT_FIT_LENGTHS } from '../../testing/ProcessWorldReplay.ts';
import frozenTable                                            from './FrozenLocalEndpoint.json';
import { localEndpointFor }                                   from './LocalEndpointFor.ts';

const endpoint = localEndpointFor('darwin');

test('the socket path of every fixed instance equals the frozen one', () => {
  expect(FROZEN_ENDPOINT_FACTS.map(endpoint.endpointOf)).toEqual(frozenTable.endpoints);
});

test('the fit of every fixed length equals the frozen one', () => {
  expect(FROZEN_ENDPOINT_FIT_LENGTHS.map((bytes) => ({ bytes, fits: endpoint.endpointFits(`/${'s'.repeat(bytes - 1)}`) }))).toEqual(frozenTable.fits);
});
