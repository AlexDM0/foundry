// What process.kill(-pid, 0) and process.kill(-pid, 'SIGTERM') raise, on a live process group and on a gone one.
import { probe } from './support/probe.js';
import { attempt, killQuietly, processIsAlive, sleepMilliseconds, startSleeper } from './support/programs.js';

const SIGNAL_SETTLE_MILLISECONDS = 300;

await probe({
  unknown: 'negative-pid-kill',
  observe: async () => {
    const sleeper = startSleeper();
    await sleepMilliseconds(SIGNAL_SETTLE_MILLISECONDS);
    const probeOfLiveGroup = await attempt(() => process.kill(-sleeper.pid, 0));
    const terminateOfLiveGroup = await attempt(() => process.kill(-sleeper.pid, 'SIGTERM'));
    await sleepMilliseconds(SIGNAL_SETTLE_MILLISECONDS);
    const aliveAfterTerminate = processIsAlive(sleeper.pid);
    killQuietly(sleeper.pid);
    await sleepMilliseconds(SIGNAL_SETTLE_MILLISECONDS);
    return {
      probeOfLiveGroup,
      terminateOfLiveGroup,
      aliveAfterTerminate,
      probeOfGoneGroup: await attempt(() => process.kill(-sleeper.pid, 0)),
      terminateOfGoneGroup: await attempt(() => process.kill(-sleeper.pid, 'SIGTERM')),
    };
  },
});
