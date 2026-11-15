// Whether process.on('SIGTERM') ever fires: a child's handler leaves a marker, under each way of asking it to stop.
import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { probe } from './support/probe.js';
import { attempt, killQuietly, runProgram, sleepMilliseconds } from './support/programs.js';
import { scratchFolder } from './support/scratch.js';

const HANDLER_EXIT_CODE = 7;
const EXIT_WAIT_MILLISECONDS = 3000;

async function handlerFiredUnder(stopChild) {
  const markerPath = join(scratchFolder(), 'handler-fired');
  const childSource = `
    process.on('SIGTERM', () => {
      require('node:fs').writeFileSync(${JSON.stringify(markerPath)}, 'fired');
      process.exit(${HANDLER_EXIT_CODE});
    });
    setInterval(() => {}, 1000);
    console.log('ready');
  `;
  const child = Bun.spawn([process.execPath, '-e', childSource], { stdin: 'ignore', stdout: 'pipe', stderr: 'ignore' });
  await child.stdout.getReader().read();
  const stop = await stopChild(child);
  await Promise.race([child.exited, sleepMilliseconds(EXIT_WAIT_MILLISECONDS)]);
  const stillRunningAfterWait = child.exitCode === null;
  if (stillRunningAfterWait) killQuietly(child.pid);
  await child.exited;
  return { handlerFired: existsSync(markerPath), stillRunningAfterWait, exitCode: child.exitCode, signalCode: child.signalCode ?? null, stop };
}

await probe({
  unknown: 'sigterm-handler',
  observe: async () => ({
    childKill: await handlerFiredUnder((child) => attempt(() => child.kill('SIGTERM'))),
    processKill: await handlerFiredUnder((child) => attempt(() => process.kill(child.pid, 'SIGTERM'))),
    gracefulTaskkill: process.platform === 'win32'
      ? await handlerFiredUnder((child) => runProgram(['taskkill', '/PID', String(child.pid)]))
      : null,
  }),
});
