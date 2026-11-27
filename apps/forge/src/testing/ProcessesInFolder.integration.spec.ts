/**
 * The stop of `src/testing/ProcessesInFolder.ts`: a process that ignores SIGTERM no longer answers signal 0 once the stop returns, since a
 * killed process answers it until the kernel tears it down. The process is real, spawned through a spawner that ends at once, so it belongs
 * to no parent that would reap it.
 */
import { existsSync } from 'node:fs';
import { join }       from 'node:path';

import {
  afterEach,
  beforeEach,
  expect,
  test
} from 'bun:test';

import { CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS }        from './ChildProcessCaseTimeout.ts';
import { processIsRunning, stopProcesses }                from './ProcessesInFolder.ts';
import { createScratchDirectory, removeScratchDirectory } from './ScratchWorkspace.ts';
import { waitUntil }                                      from './WaitUntil.ts';

let plantedFolder = '';

beforeEach(() => {
  plantedFolder = createScratchDirectory('stopped-process');
});

afterEach(() => {
  removeScratchDirectory(plantedFolder);
});

/** A process that ignores SIGTERM and writes `readyMarker` once its handler is in place; its pid. */
function plantedProcessIgnoringSigterm(readyMarker: string): number {
  const plantedScript = `process.on('SIGTERM', () => {}); require('node:fs').writeFileSync(${JSON.stringify(readyMarker)}, ''); setInterval(() => {}, 1000);`;
  const spawnerScript = [
    `const child = Bun.spawn([process.execPath, '-e', ${JSON.stringify(plantedScript)}],`,
    '  { stdin: \'ignore\', stdout: \'ignore\', stderr: \'ignore\' });',
    'child.unref();',
    'console.log(child.pid);',
  ].join(' ');
  const spawner = Bun.spawnSync([process.execPath, '-e', spawnerScript], { cwd: plantedFolder, stdout: 'pipe', stderr: 'ignore' });
  return Number(spawner.stdout.toString().trim());
}

test('a process only the SIGKILL ends no longer answers signal 0 once the stop returns', async () => {
  const readyMarker = join(plantedFolder, 'ready');
  const processId   = plantedProcessIgnoringSigterm(readyMarker);
  // A failed spawner prints no pid, and a signal to pid 0 would reach the test runner's own process group.
  expect(processId).toBeGreaterThan(0);
  await waitUntil(() => existsSync(readyMarker), 'the planted process installed its SIGTERM handler');
  await stopProcesses([{ processId, command: 'planted' }]);
  expect(processIsRunning(processId)).toBe(false);
}, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);
