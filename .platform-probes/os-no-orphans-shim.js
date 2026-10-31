// `bun --no-orphans` as a shim: whether a grandchild outlives the shim's normal exit, and the shim being killed.
import { join } from 'node:path';

import { probe } from './support/probe.js';
import { killQuietly, processIsAlive, sleepMilliseconds } from './support/programs.js';
import { scratchFolder } from './support/scratch.js';

const SHIM_LIFETIME_MILLISECONDS = 30_000;
const SETTLE_MILLISECONDS = 1000;

async function grandchildFateUnder(shimLifetimeMilliseconds, endShim) {
  const scriptPath = join(scratchFolder(), 'shim.js');
  await Bun.write(scriptPath, `
    const grandchild = Bun.spawn([process.execPath, '-e', 'setTimeout(() => {}, 60000)'], { stdin: 'ignore', stdout: 'ignore', stderr: 'ignore' });
    console.log(grandchild.pid);
    setTimeout(() => process.exit(0), ${shimLifetimeMilliseconds});
  `);
  const shim = Bun.spawn([process.execPath, '--no-orphans', scriptPath], { stdin: 'ignore', stdout: 'pipe', stderr: 'pipe' });
  const { value } = await shim.stdout.getReader().read();
  const grandchildPid = Number(new TextDecoder().decode(value).trim());
  endShim(shim);
  await shim.exited;
  await sleepMilliseconds(SETTLE_MILLISECONDS);
  const grandchildAlive = processIsAlive(grandchildPid);
  killQuietly(grandchildPid);
  return { shimExitCode: shim.exitCode, shimSignalCode: shim.signalCode ?? null, grandchildAlive };
}

await probe({
  unknown: 'no-orphans-shim',
  observe: async () => ({
    afterNormalExit: await grandchildFateUnder(0, () => {}),
    afterShimKilled: await grandchildFateUnder(SHIM_LIFETIME_MILLISECONDS, (shim) => shim.kill('SIGKILL')),
  }),
});
