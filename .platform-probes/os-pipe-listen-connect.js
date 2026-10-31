// node:net listen and connect on a pipe name: whether both work, and a line's round trip in milliseconds.
import { closeServer, connectTo, listenOn, pipePathOf } from './support/pipes.js';
import { probe } from './support/probe.js';

await probe({
  unknown: 'pipe-listen-connect',
  observe: async () => {
    const path = pipePathOf('listen-connect');
    const { server, listenError } = await listenOn(path);
    if (listenError !== null) return { path, listenError };
    server.on('connection', (peer) => peer.on('data', (data) => peer.write(data)));
    const { socket, connectError } = await connectTo(path);
    if (connectError !== null) return { path, listenError, connectError };
    const startedAt = performance.now();
    const echoed = await new Promise((resolve) => {
      socket.once('data', (data) => resolve(String(data)));
      socket.write('line\n');
    });
    const roundTripMilliseconds = performance.now() - startedAt;
    socket.destroy();
    await closeServer(server);
    return { path, listenError, connectError, echoed, roundTripMilliseconds };
  },
});
