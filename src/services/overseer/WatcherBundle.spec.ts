/**
 * The Watcher code an Overseer pins at its start. What matters: a Watcher spawned after the entry's source was edited still runs the code bundled
 * at the start, since a landing or a pull must never change what a later Watcher runs; and pinning again for the same code version keeps
 * the bundle rather than rebuilding it from the edited source.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join }                                   from 'node:path';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  test
} from 'bun:test';

import { watcherFilesOf }                                 from '../../lib/watcher/WatcherFiles.ts';
import { nativePlatformPorts }                            from '../../testing/NativePlatformPorts.ts';
import { createScratchDirectory, removeScratchDirectory } from '../../testing/ScratchWorkspace.ts';
import { firstValueOf }                                   from '../../testing/WaitUntil.ts';
import { WatcherBundle }                                  from './WatcherBundle.ts';
import { WatcherFleet }                                   from './WatcherFleet.ts';

let scratchDirectory = '';

beforeEach(() => {
  scratchDirectory = createScratchDirectory('watcher-bundle');
});

afterEach(() => {
  removeScratchDirectory(scratchDirectory);
});

async function watcherLogOnceWritten(watcherLogPath: string): Promise<string> {
  return await firstValueOf(() => readFileSync(watcherLogPath, 'utf8') || undefined, `the spawned Watcher writing ${watcherLogPath}`);
}

describe('WatcherBundle', () => {
  test('a Watcher spawned after the entry source was edited runs the code bundled at the start', async () => {
    const entryPath = join(scratchDirectory, 'example-watcher.ts');
    writeFileSync(entryPath, 'console.log(\'bundled at the start\');\n');
    const overseerDirectory = join(scratchDirectory, 'overseer');
    mkdirSync(overseerDirectory);
    const bundlePath = await WatcherBundle.pinWatcherBundle({ overseerDirectory, codeVersion: 'code-example', entryPath });
    expect(bundlePath).toBe(join(overseerDirectory, 'watcher-code-example.js'));

    writeFileSync(entryPath, 'console.log(\'edited after the start\');\n');
    expect(await WatcherBundle.pinWatcherBundle({ overseerDirectory, codeVersion: 'code-example', entryPath })).toBe(bundlePath);
    const jobFolder = join(scratchDirectory, 'jobs', 'J1');
    mkdirSync(jobFolder, { recursive: true });
    WatcherFleet.spawnWatcher(nativePlatformPorts(), {
      bundlePath, jobFolder, instance: 1, rootDirectory: scratchDirectory
    });
    expect(await watcherLogOnceWritten(watcherFilesOf(jobFolder, 1).watcherLogPath)).toBe('bundled at the start\n');
  });
});
