// What Bun reports as exitCode and signalCode after child.kill and after a kill from another process.
import { probe } from './support/probe.js';
import { killFromOutside } from './support/programs.js';

const startChild = () => Bun.spawn([process.execPath, '-e', 'setInterval(() => {}, 1000)'], { stdin: 'ignore', stdout: 'ignore', stderr: 'ignore' });

async function exitAfter(kill) {
  const child = startChild();
  const killRun = await kill(child);
  await child.exited;
  return { exitCode: child.exitCode, signalCode: child.signalCode ?? null, killed: child.killed, killRun: killRun ?? null };
}

await probe({
  unknown: 'signal-code-after-kill',
  observe: async () => ({
    afterChildKillDefault: await exitAfter((child) => { child.kill(); }),
    afterChildKillSigterm: await exitAfter((child) => { child.kill('SIGTERM'); }),
    afterChildKillSigkill: await exitAfter((child) => { child.kill('SIGKILL'); }),
    afterExternalKill: await exitAfter((child) => killFromOutside(child.pid)),
  }),
});
