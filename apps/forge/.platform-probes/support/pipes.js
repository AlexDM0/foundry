// node:net over a Windows named pipe, or a Unix socket elsewhere, with every outcome as a value.
import { createConnection, createServer } from 'node:net';
import { join } from 'node:path';

import { errorFactsOf } from './programs.js';
import { scratchFolder } from './scratch.js';

export function pipePathOf(name) {
  return process.platform === 'win32' ? `\\\\.\\pipe\\platform-probe-${process.pid}-${name}` : join(scratchFolder(), `${name}.sock`);
}

export function listenOn(path, serverOptions = {}) {
  const server = createServer(serverOptions);
  return new Promise((resolve) => {
    server.once('error', (error) => resolve({ server, listenError: errorFactsOf(error) }));
    server.listen(path, () => resolve({ server, listenError: null }));
  });
}

export function connectTo(path, connectionOptions = {}) {
  const socket = createConnection({ path, ...connectionOptions });
  return new Promise((resolve) => {
    socket.once('error', (error) => resolve({ socket, connectError: errorFactsOf(error) }));
    socket.once('connect', () => resolve({ socket, connectError: null }));
  });
}

export const closeServer = (server) => new Promise((resolve) => {
  server.close(() => resolve());
});
