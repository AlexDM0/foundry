// The error event a second listener on a taken pipe name gets, and whether a client can still connect.
import { closeServer, connectTo, listenOn, pipePathOf } from './support/pipes.js';
import { probe } from './support/probe.js';

await probe({
  unknown: 'pipe-busy-error',
  observe: async () => {
    const path = pipePathOf('busy');
    const first = await listenOn(path);
    const second = await listenOn(path);
    const { socket, connectError } = await connectTo(path);
    socket.destroy();
    await closeServer(first.server);
    if (second.listenError === null) await closeServer(second.server);
    return { path, firstListenError: first.listenError, secondListenError: second.listenError, connectError };
  },
});
