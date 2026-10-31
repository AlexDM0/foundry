// Whether a pipe name comes free after its owner is killed, and how long a new listener waits for it.
import { closeServer, listenOn, pipePathOf } from './support/pipes.js';
import { probe } from './support/probe.js';
import { killQuietly, sleepMilliseconds } from './support/programs.js';

const RELISTEN_WINDOW_MILLISECONDS = 5000;
const RELISTEN_STEP_MILLISECONDS = 100;

await probe({
  unknown: 'pipe-release-after-crash',
  observe: async () => {
    const path = pipePathOf('crash');
    const ownerSource = `require('node:net').createServer().listen(${JSON.stringify(path)}, () => console.log('listening'));`;
    const owner = Bun.spawn([process.execPath, '-e', ownerSource], { stdin: 'ignore', stdout: 'pipe', stderr: 'ignore' });
    await owner.stdout.getReader().read();
    killQuietly(owner.pid);
    await owner.exited;
    const startedAt = Date.now();
    const refusalCounts = {};
    while (Date.now() - startedAt < RELISTEN_WINDOW_MILLISECONDS) {
      const { server, listenError } = await listenOn(path);
      if (listenError === null) {
        await closeServer(server);
        return { path, listenedAfterMilliseconds: Date.now() - startedAt, refusalCounts };
      }
      refusalCounts[listenError.code] = (refusalCounts[listenError.code] ?? 0) + 1;
      await sleepMilliseconds(RELISTEN_STEP_MILLISECONDS);
    }
    return { path, listenedAfterMilliseconds: null, refusalCounts };
  },
});
