// How long a half-close takes to reach the other end: the server's 'end' after the client's end(), per attempt.
import { closeServer, connectTo, listenOn, pipePathOf } from './support/pipes.js';
import { probe } from './support/probe.js';

const HALF_CLOSE_ATTEMPTS = 20;
const END_WAIT_MILLISECONDS = 5000;

await probe({
  unknown: 'pipe-half-close-latency',
  observe: async () => {
    const path = pipePathOf('half-close');
    const { server, listenError } = await listenOn(path, { allowHalfOpen: true });
    if (listenError !== null) return { path, listenError };
    const latenciesMilliseconds = [];
    let responsesAfterHalfClose = 0;
    server.on('connection', (peer) => {
      peer.on('data', () => {});
      peer.on('end', () => peer.end('reply'));
    });
    for (let i = 0; i < HALF_CLOSE_ATTEMPTS; i += 1) {
      const { socket } = await connectTo(path, { allowHalfOpen: true });
      const startedAt = performance.now();
      const replied = await new Promise((resolve) => {
        const timer = setTimeout(() => resolve(false), END_WAIT_MILLISECONDS);
        socket.on('data', () => { clearTimeout(timer); resolve(true); });
        socket.end();
      });
      latenciesMilliseconds.push(performance.now() - startedAt);
      if (replied) responsesAfterHalfClose += 1;
      socket.destroy();
    }
    await closeServer(server);
    return { path, attempts: HALF_CLOSE_ATTEMPTS, responsesAfterHalfClose, latenciesMilliseconds };
  },
});
