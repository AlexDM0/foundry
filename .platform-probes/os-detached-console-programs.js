// Bun issue #31603: does a console program started with detached:true do its work? A marker file proves it did.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { probe } from './support/probe.js';
import { errorFactsOf, sleepMilliseconds } from './support/programs.js';
import { scratchFolder } from './support/scratch.js';

const MARKER_WAIT_MILLISECONDS = 20_000;
const MARKER_POLL_MILLISECONDS = 100;

async function detachedRunOf(argv, markerPath) {
  const startedAt = Date.now();
  const exit = { exitCode: null, signalCode: null, spawnError: null };
  const child = spawn(argv[0], argv.slice(1), { detached: true, stdio: 'ignore' });
  child.on('error', (error) => { exit.spawnError = errorFactsOf(error); });
  child.on('exit', (exitCode, signalCode) => Object.assign(exit, { exitCode, signalCode }));
  while (Date.now() - startedAt < MARKER_WAIT_MILLISECONDS && !existsSync(markerPath) && exit.spawnError === null) {
    await sleepMilliseconds(MARKER_POLL_MILLISECONDS);
  }
  return { pid: child.pid ?? null, markerExists: existsSync(markerPath), millisecondsWaited: Date.now() - startedAt, ...exit };
}

await probe({
  unknown: 'detached-console-programs',
  appliesTo: ['win32'],
  observe: async () => {
    const folder = scratchFolder();
    const marker = (name) => join(folder, name);
    const powershellLine = (name) => `Set-Content -Path '${marker(name)}' -Value ran`;
    return {
      'powershell.exe': await detachedRunOf(['powershell.exe', '-NoProfile', '-Command', powershellLine('powershell')], marker('powershell')),
      pwsh: await detachedRunOf(['pwsh', '-NoProfile', '-Command', powershellLine('pwsh')], marker('pwsh')),
      'cmd.exe': await detachedRunOf(['cmd.exe', '/d', '/c', `echo ran> "${marker('cmd')}"`], marker('cmd')),
      git: await detachedRunOf(['git', 'init', marker('git')], join(marker('git'), '.git', 'HEAD')),
    };
  },
});
