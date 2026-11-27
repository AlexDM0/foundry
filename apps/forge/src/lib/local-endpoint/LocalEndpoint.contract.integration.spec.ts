/**
 * One contract for the `LocalEndpoint` port, run on the socket adapter on injected and real primitives and on the pipe adapter over a fake
 * listener: an endpoint is one per instance, a frame crosses a bound endpoint, a taken endpoint fails the listen with a verdict, a release
 * frees it and never throws. The socket adapter adds what a file leaves behind, a real crash among it; the pipe adapter what makes its name
 * safe: drawn at random for each launch, and no file touched. The platform without an adapter refuses instead.
 */
import { EventEmitter } from 'node:events';
import {
  existsSync,
  readdirSync,
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
import { join, win32 } from 'node:path';
import { duplexPair }  from 'node:stream';
import {
  afterAll,
  describe,
  expect,
  test
} from 'bun:test';

import { listenOnIdleTalosSocket, type TalosSocketListening }                                     from '../../../talos/testing/IdleTalosSocket.ts';
import { type PortClause, type PortSubject, runPortContract }                                     from '../../testing/PortContract.ts';
import { createScratchDirectory, removeScratchDirectory }                                         from '../../testing/ScratchWorkspace.ts';
import { ownerOnlyFilesFor }                                                                      from '../owner-only-files/OwnerOnlyFilesFor.ts';
import type { EndpointInstanceFacts, LocalEndpoint }                                              from './LocalEndpoint.ts';
import { localEndpointFor, REAL_ENDPOINT_PRIMITIVES }                                             from './LocalEndpointFor.ts';
import { createPosixSocketEndpoint, MACOS_SOCKET_PATH_LIMIT_BYTES, type PosixEndpointPrimitives } from './PosixSocketEndpoint.ts';
import { createUnsupportedLocalEndpoint }                                                         from './UnsupportedLocalEndpoint.ts';
import { createWindowsPipeEndpoint, WINDOWS_PIPE_ACCESS, type WindowsPipePrimitives }             from './WindowsPipeEndpoint.ts';

const OWNER_ONLY_MODE_BITS = 0o777;
const OWNER_ONLY_MODE = 0o700;
const PIPE_NAME_PREFIX = 'example-product';
const PIPE_NAME_LIMIT_CHARACTERS = 256;
const SIGKILL_EXIT_CODE = 137;

const scratchFolders: string[] = [];

afterAll(() => {
  for (const folder of scratchFolders) removeScratchDirectory(folder);
});

function scratchFacts(instance: number): EndpointInstanceFacts {
  // The short prefix keeps a socket path under the macOS limit inside the scratch root.
  const socketFolder = createScratchDirectory('e');
  scratchFolders.push(socketFolder);
  return {
    socketFolder, scope: 'scope-example', name: 'J-1', instance
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

/** One machine's pipe names: the first listener of a name holds it, as libuv's first-instance bind does, and a second reads `EADDRINUSE`. */
function fakePipeListeners(): WindowsPipePrimitives {
  const listeners = new Map<string, (socket: Socket) => void>();
  let namesDrawn = 0;
  return {
    randomHexOf: (byteCount) => {
      namesDrawn += 1;
      return namesDrawn.toString(16).padStart(byteCount + byteCount, '0');
    },
    serverOf: (onConnection) => {
      const server = new EventEmitter();
      let boundName: string | null = null;
      return Object.assign(server, {
        listen: (name: string, onListening: () => void) => {
          if (listeners.has(name)) {
            queueMicrotask(() => server.emit('error', Object.assign(new Error('listen EADDRINUSE'), { code: 'EADDRINUSE' })));
            return server;
          }
          listeners.set(name, onConnection);
          boundName = name;
          queueMicrotask(onListening);
          return server;
        },
        close: () => {
          if (boundName !== null) listeners.delete(boundName);
          return server;
        },
      }) as unknown as Server;
    },
    connectionTo: (endpoint) => {
      const [client, served] = duplexPair();
      const listener = listeners.get(endpoint);
      if (listener === undefined) queueMicrotask(() => client.destroy(new Error('connect ENOENT')));
      else listener(served as unknown as Socket);
      return client as unknown as Socket;
    },
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

async function connectIsRefused(port: LocalEndpoint, endpoint: string): Promise<boolean> {
  return await new Promise<boolean>((resolve) => {
    const connection = port.connectionTo(endpoint);
    connection.once('error', () => resolve(true));
    connection.once('connect', () => {
      connection.destroy();
      resolve(false);
    });
  });
}

async function talosSocketOn(port: LocalEndpoint, socketPath: string): Promise<TalosSocketListening> {
  return await listenOnIdleTalosSocket(port, socketPath, 'example-secret');
}

/** A process that binds the socket and dies by SIGKILL, so nothing of it runs to close the socket or clear its file. */
async function crashedWhileListening(socketPath: string): Promise<void> {
  const script = `require('node:net').createServer().listen(${JSON.stringify(socketPath)}, () => process.kill(process.pid, 'SIGKILL'));`;
  expect(await Bun.spawn([process.execPath, '-e', script], { stdout: 'ignore', stderr: 'ignore' }).exited).toBe(SIGKILL_EXIT_CODE);
}

const SOCKET_SUBJECTS: readonly PortSubject<LocalEndpoint>[] = [
  { name: 'the socket adapter on injected primitives', build: () => createPosixSocketEndpoint(injectedPrimitives(), MACOS_SOCKET_PATH_LIMIT_BYTES) },
  { name: 'the socket adapter on real primitives', build: () => createPosixSocketEndpoint(REAL_ENDPOINT_PRIMITIVES, MACOS_SOCKET_PATH_LIMIT_BYTES) },
];

const SUBJECTS: readonly PortSubject<LocalEndpoint>[] = [
  ...SOCKET_SUBJECTS,
  { name: 'the pipe adapter over a fake listener', build: () => createWindowsPipeEndpoint(fakePipeListeners(), PIPE_NAME_PREFIX) },
  { name: 'the native adapter', build: () => localEndpointFor(process.platform, PIPE_NAME_PREFIX) },
];

const CLAUSES: readonly PortClause<LocalEndpoint>[] = [
  {
    claim: 'each instance has its own endpoint',
    check: (port) => {
      const facts = scratchFacts(1);
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
    claim: 'a frame crosses a prepared endpoint',
    check: async (port) => {
      const endpoint = port.endpointOf(scratchFacts(1));
      expect(port.prepareEndpoint(endpoint)).toEqual({ verdict: 'done' });
      expect(await lineCrossing(port, endpoint)).toBe('example line');
    },
  },
  {
    claim: 'a connect to an endpoint nobody listens on is refused',
    check: async (port) => {
      const endpoint = port.endpointOf(scratchFacts(1));
      port.prepareEndpoint(endpoint);
      expect(await connectIsRefused(port, endpoint)).toBe(true);
    },
  },
  {
    claim: 'an endpoint another listener holds fails the bind with a verdict',
    check: async (port) => {
      const endpoint = port.endpointOf(scratchFacts(1));
      port.prepareEndpoint(endpoint);
      const holder = await talosSocketOn(port, endpoint);
      const second = await talosSocketOn(port, endpoint);
      expect(second).toMatchObject({ verdict: 'unbindable', systemError: expect.stringContaining('EADDRINUSE') });
      if (holder.verdict === 'listening') holder.server.close();
      expect(holder.verdict).toBe('listening');
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
      expect(await connectIsRefused(port, endpoint)).toBe(true);
    },
  },
];

const SOCKET_CLAUSES: readonly PortClause<LocalEndpoint>[] = [
  {
    claim: 'an instance answers the same endpoint every time',
    check: (port) => {
      const facts = scratchFacts(1);
      expect(port.endpointOf(facts)).toBe(port.endpointOf(facts));
    },
  },
  {
    claim: 'prepare makes an owner-only folder and clears what a dead Talos left',
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
    claim: 'what a crashed listener left refuses a connect, and a release frees it for the next bind',
    check: async (port) => {
      const endpoint = port.endpointOf(scratchFacts(1));
      port.prepareEndpoint(endpoint);
      await crashedWhileListening(endpoint);
      expect(await connectIsRefused(port, endpoint)).toBe(true);
      expect(port.releaseEndpoint(endpoint)).toEqual({ verdict: 'done' });
      expect(await lineCrossing(port, endpoint)).toBe('example line');
    },
  },
];

runPortContract('LocalEndpoint', SUBJECTS, CLAUSES);
runPortContract('LocalEndpoint socket', SOCKET_SUBJECTS, SOCKET_CLAUSES);

test('a folder that cannot be made is a refused verdict, never a throw', () => {
  const failing = createPosixSocketEndpoint({
    ...injectedPrimitives(),
    restrictFolder: () => {
      throw new Error('example EACCES');
    },
  }, MACOS_SOCKET_PATH_LIMIT_BYTES);
  expect(failing.prepareEndpoint('/example/private/a.sock')).toEqual({ verdict: 'refused', refusal: { cause: 'system-error', systemError: 'Error: example EACCES' } });
});

test('a folder that cannot be proved owner-only is a refused verdict, and the old socket file stays', () => {
  const removedFiles: string[] = [];
  const refusing = createPosixSocketEndpoint({
    ...injectedPrimitives(),
    restrictFolder: (folder) => ({ verdict: 'refused', cause: 'not-proved-owner-only', path: folder }),
    removeFile:     (path) => removedFiles.push(path),
  }, MACOS_SOCKET_PATH_LIMIT_BYTES);
  const privateFolderRefusal = { cause: 'folder-not-private', restrictionCause: 'not-proved-owner-only', path: '/example/private' } as const;
  expect(refusing.prepareEndpoint('/example/private/a.sock')).toEqual({ verdict: 'refused', refusal: privateFolderRefusal });
  expect(removedFiles).toEqual([]);
});

test('a socket file that cannot be removed is a refused verdict at the release, never a throw', () => {
  const failing = createPosixSocketEndpoint({
    ...injectedPrimitives(),
    removeFile: () => {
      throw new Error('example EPERM');
    },
  }, MACOS_SOCKET_PATH_LIMIT_BYTES);
  expect(failing.releaseEndpoint('/example/private/a.sock')).toEqual({ verdict: 'refused', refusal: { cause: 'system-error', systemError: 'Error: example EPERM' } });
});

describe('a Windows pipe', () => {
  const pipe = createWindowsPipeEndpoint(fakePipeListeners(), PIPE_NAME_PREFIX);

  test('the real selector names it `\\\\.\\pipe\\<prefix>-<32 hex digits>`, and path.win32 reads that as absolute', () => {
    const endpoint = localEndpointFor('win32', PIPE_NAME_PREFIX).endpointOf(scratchFacts(1));
    expect(endpoint).toMatch(/^\\\\\.\\pipe\\example-product-[0-9a-f]{32}$/);
    expect(win32.isAbsolute(endpoint)).toBe(true);
  });

  test('the same facts draw another name at each launch, so nothing predicts one from the tracker and the job', () => {
    const facts = scratchFacts(1);
    expect(pipe.endpointOf(facts)).not.toBe(pipe.endpointOf(facts));
    const real = localEndpointFor('win32', PIPE_NAME_PREFIX);
    expect(real.endpointOf(facts)).not.toBe(real.endpointOf(facts));
  });

  test('prepare and release touch no file and answer done, whatever the name', () => {
    const facts = scratchFacts(1);
    const endpoint = pipe.endpointOf(facts);
    expect(pipe.prepareEndpoint(endpoint)).toEqual({ verdict: 'done' });
    expect(pipe.releaseEndpoint(endpoint)).toEqual({ verdict: 'done' });
    expect(pipe.releaseEndpoint('never bound')).toEqual({ verdict: 'done' });
    expect(readdirSync(facts.socketFolder)).toEqual([]);
  });

  test('fits inside the namespace up to the limit of the name, and a file path never does', () => {
    const fillerOf = (characters: number): string => `\\\\.\\pipe\\${'p'.repeat(characters)}`;
    const namespaceCharacters = fillerOf(0).length;
    expect(pipe.endpointFits(fillerOf(PIPE_NAME_LIMIT_CHARACTERS - namespaceCharacters))).toBe(true);
    expect(pipe.endpointFits(fillerOf(PIPE_NAME_LIMIT_CHARACTERS - namespaceCharacters + 1))).toBe(false);
    expect(pipe.endpointFits('/example/private/a.sock')).toBe(false);
  });

  test('its name and each hello\'s secret are its only guard: no permission is attempted', () => {
    expect(WINDOWS_PIPE_ACCESS).toBe('secret-guarded');
  });
});

describe('a platform with no adapter', () => {
  const refusal = { verdict: 'refused', refusal: { cause: 'no-adapter', platformName: 'example-os' } } as const;

  test('names no endpoint, fits none and refuses to prepare or release', () => {
    const unsupported = createUnsupportedLocalEndpoint('example-os');
    expect(unsupported.endpointOf(scratchFacts(1))).toBe('');
    expect(unsupported.endpointFits('/any')).toBe(false);
    expect(unsupported.prepareEndpoint('/any')).toEqual(refusal);
    expect(unsupported.releaseEndpoint('/any')).toEqual(refusal);
  });

  test('the selector answers an unknown platform with that refusal', () => {
    expect(localEndpointFor('example-os', PIPE_NAME_PREFIX).prepareEndpoint('/any')).toEqual(refusal);
  });
});
