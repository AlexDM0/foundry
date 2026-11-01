/**
 * One contract for the `LocalEndpoint` port, run on injected primitives and on the real ones: an endpoint is one per instance, what a dead
 * Watcher left behind never stops a bind, a frame crosses a bound endpoint, a release frees it, and a failure is a verdict rather than a throw.
 * The platform without an adapter refuses instead.
 */
import {
  existsSync,
  rmSync,
  statSync,
  writeFileSync
} from 'node:fs';
import {
  createConnection,
  createServer,
  type Server,
  type Socket
} from 'node:net';
import { join } from 'node:path';
import {
  afterAll,
  describe,
  expect,
  test
} from 'bun:test';

import { type PortClause, type PortSubject, runPortContract }      from '../../testing/PortContract.ts';
import { createScratchDirectory, removeScratchDirectory }          from '../../testing/ScratchWorkspace.ts';
import { ownerOnlyFilesFor }                                       from '../owner-only-files/OwnerOnlyFilesFor.ts';
import type { LocalEndpoint }                                      from './LocalEndpoint.ts';
import { localEndpointFor }                                        from './LocalEndpointFor.ts';
import { createPosixSocketEndpoint, type PosixEndpointPrimitives } from './PosixSocketEndpoint.ts';
import { createUnsupportedLocalEndpoint }                          from './UnsupportedLocalEndpoint.ts';

const OWNER_ONLY_MODE_BITS = 0o777;
const OWNER_ONLY_MODE = 0o700;

const scratchFolders: string[] = [];

afterAll(() => {
  for (const folder of scratchFolders) removeScratchDirectory(folder);
});

function scratchFacts(instance: number): { monitorFolder: string; trackerId: string; jobId: string; instance: number } {
  // The short prefix keeps a socket path under the macOS limit inside the scratch root.
  const monitorFolder = createScratchDirectory('e');
  scratchFolders.push(monitorFolder);
  return {
    monitorFolder, trackerId: 'tracker-example', jobId: 'J-1', instance
  };
}

function injectedPrimitives(): PosixEndpointPrimitives {
  return {
    restrictFolder: (folder) => ownerOnlyFilesFor('darwin').restrictFolder(folder),
    removeFile:     (path) => rmSync(path, { force: true }),
    serverOf:       (onConnection) => createServer(onConnection),
    connectionTo:   (endpoint) => createConnection(endpoint),
  };
}

async function listening(server: Server, endpoint: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(endpoint, () => resolve());
  });
}

async function lineCrossing(port: LocalEndpoint, endpoint: string): Promise<string> {
  const received = new Promise<string>((resolve) => {
    const server = port.serverOf((socket: Socket) => {
      socket.once('data', (chunk) => {
        resolve(chunk.toString());
        socket.end();
        server.close();
      });
    });
    void listening(server, endpoint).then(() => {
      port.connectionTo(endpoint).end('example line');
    });
  });
  return await received;
}

const SUBJECTS: readonly PortSubject<LocalEndpoint>[] = [
  { name: 'the POSIX adapter on injected primitives', build: () => createPosixSocketEndpoint(injectedPrimitives()) },
  { name: 'the native adapter on real primitives', build: () => localEndpointFor(process.platform) },
];

const CLAUSES: readonly PortClause<LocalEndpoint>[] = [
  {
    claim: 'each instance has its own endpoint, the same every time',
    check: (port) => {
      const facts = scratchFacts(1);
      expect(port.endpointOf(facts)).toBe(port.endpointOf(facts));
      expect(port.endpointOf({ ...facts, instance: 2 })).not.toBe(port.endpointOf(facts));
    },
  },
  {
    claim: 'an endpoint it names fits, and a far longer one does not',
    check: (port) => {
      expect(port.endpointFits(port.endpointOf(scratchFacts(1)))).toBe(true);
      expect(port.endpointFits(`/${'s'.repeat(1000)}`)).toBe(false);
    },
  },
  {
    claim: 'prepare makes an owner-only folder and clears what a dead Watcher left',
    check: (port) => {
      const endpoint = port.endpointOf(scratchFacts(1));
      expect(port.prepareEndpoint(endpoint)).toEqual({ verdict: 'done' });
      writeFileSync(endpoint, 'left behind');
      expect(port.prepareEndpoint(endpoint)).toEqual({ verdict: 'done' });
      expect(existsSync(endpoint)).toBe(false);

      expect(statSync(join(endpoint, '..')).mode & OWNER_ONLY_MODE_BITS).toBe(OWNER_ONLY_MODE);
    },
  },
  {
    claim: 'a frame crosses a prepared endpoint',
    check: async (port) => {
      const endpoint = port.endpointOf(scratchFacts(1));
      port.prepareEndpoint(endpoint);
      expect(await lineCrossing(port, endpoint)).toBe('example line');
    },
  },
  {
    claim: 'a release frees the endpoint, also when nothing is there',
    check: async (port) => {
      const endpoint = port.endpointOf(scratchFacts(1));
      port.prepareEndpoint(endpoint);
      await lineCrossing(port, endpoint);
      expect(port.releaseEndpoint(endpoint)).toEqual({ verdict: 'done' });
      expect(port.releaseEndpoint(endpoint)).toEqual({ verdict: 'done' });
      expect(existsSync(endpoint)).toBe(false);
    },
  },
];

runPortContract('LocalEndpoint', SUBJECTS, CLAUSES);

test('a folder that cannot be made is a refused verdict, never a throw', () => {
  const failing = createPosixSocketEndpoint({
    ...injectedPrimitives(),
    restrictFolder: () => {
      throw new Error('example EACCES');
    },
  });
  expect(failing.prepareEndpoint('/example/watchers/a.sock')).toEqual({ verdict: 'refused', reason: 'Error: example EACCES' });
});

describe('a platform with no adapter', () => {
  const refusal = { verdict: 'refused', reason: 'no local endpoint exists for the platform example-os' } as const;

  test('names no endpoint, fits none and refuses to prepare or release', () => {
    const unsupported = createUnsupportedLocalEndpoint('example-os');
    expect(unsupported.endpointOf(scratchFacts(1))).toBe('');
    expect(unsupported.endpointFits('/any')).toBe(false);
    expect(unsupported.prepareEndpoint('/any')).toEqual(refusal);
    expect(unsupported.releaseEndpoint('/any')).toEqual(refusal);
  });

  test('the selector answers win32 with that refusal', () => {
    expect(localEndpointFor('win32').prepareEndpoint('/any').verdict).toBe('refused');
  });
});
