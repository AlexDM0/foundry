/**
 * The Overseer's reaping of ended Watchers, against the real Watcher binary. What matters: an ended Watcher lingers for its acknowledgement, and the
 * sweep over the tracker's job folders gives it, so the Watcher process is gone once its job ended, a Watcher and a process Watcher in its
 * job's subfolder alike; a Watcher still running its child is never touched by the reap. `stopLiveProcessWatchers`, the Overseer's `--now` stop,
 * stops a live process Watcher and waits for its recorded end, but never touches a Watcher. A send to a live Watcher reads its reply and
 * settles on its close, never at the frame timeout.
 */
import {
  existsSync,
  mkdirSync,
  symlinkSync,
  writeFileSync
} from 'node:fs';
import { join } from 'node:path';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  test
} from 'bun:test';

import { processIsGone }                                             from '../../lib/process-identity/ProcessIdentity.ts';
import { CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS }                   from '../../testing/ChildProcessCaseTimeout.ts';
import { nativePlatformPorts }                                       from '../../testing/NativePlatformPorts.ts';
import { createScratchDirectory, removeScratchDirectory }            from '../../testing/ScratchWorkspace.ts';
import { waitUntil }                                                 from '../../testing/WaitUntil.ts';
import { type WatcherJob, createWatcherJob, WATCHER_JOB_IDENTIFIER } from '../../testing/WatcherJob.ts';
import { WatcherFleet }                                              from './WatcherFleet.ts';

const ports = nativePlatformPorts();

const WATCHER_BINARY_PATH = new URL('../../../watcher.ts', import.meta.url).pathname;
const LINGER_WATCHED_MILLISECONDS = 100;
/** Far below the 2 s frame timeout, so a send that waits it out instead of reading the Watcher's reply fails. */
const SEND_SETTLE_BOUND_MILLISECONDS = 200;

let currentWatcherJob: WatcherJob | null = null;
let trackerDirectory = '';

beforeEach(() => {
  currentWatcherJob = createWatcherJob();
  trackerDirectory = createScratchDirectory('tracker');
  mkdirSync(join(trackerDirectory, 'jobs'));
  symlinkSync(currentWatcherJob.jobFolder, join(trackerDirectory, 'jobs', WATCHER_JOB_IDENTIFIER));
});

afterEach(() => {
  currentWatcherJob?.remove();
  currentWatcherJob = null;
  removeScratchDirectory(trackerDirectory);
});

function watcherJob(): WatcherJob {
  if (currentWatcherJob === null) throw new Error('no Watcher job');
  return currentWatcherJob;
}

async function untilEnded(watcherFolder: string, instance: number): Promise<void> {
  await waitUntil(() => WatcherFleet.livenessOf(ports, watcherFolder, instance).verdict === 'ended', `Watcher ${instance} ending`);
}

async function untilGone(processId: number): Promise<void> {
  await waitUntil(() => processIsGone(processId), `process ${processId} going`);
}

async function untilLive(watcherFolder: string, instance: number): Promise<void> {
  await waitUntil(() => WatcherFleet.livenessOf(ports, watcherFolder, instance).verdict === 'live', `Watcher ${instance} going live`);
}

/** A process Watcher, instance 1, in the job's subfolder `subfolderName`, running `script` under this Bun, started in `rootDirectory` when given. */
function spawnProcessWatcher(subfolderName: string, script: string, rootDirectory?: string): { watcherFolder: string; processId: number } {
  const watcherFolder = join(watcherJob().jobFolder, subfolderName);
  WatcherFleet.writeProcessLaunchFile(ports, {
    watcherFolder,
    instance:           1,
    jobId:              WATCHER_JOB_IDENTIFIER,
    socketName:         `${WATCHER_JOB_IDENTIFIER}/${subfolderName}`,
    trackerId:          'tracker-example',
    monitorFolder:      watcherJob().monitorFolder,
    watcherCodeVersion: 'code-example',
    workingDirectory:   watcherFolder,
    argv:               [process.execPath, '-e', script],
    environment:        {},
  });
  const processId = WatcherFleet.spawnWatcher(ports, {
    bundlePath: WATCHER_BINARY_PATH, jobFolder: watcherFolder, instance: 1, rootDirectory: rootDirectory ?? watcherFolder
  });
  if (processId === undefined) throw new Error('the process Watcher did not spawn');
  return { watcherFolder, processId };
}

describe('reaping ended watchers', () => {
  test('an ended Watcher lingers until the sweep acknowledges its end, then exits 0', async () => {
    watcherJob().writeLaunch(1, 'agent', 'console.log("done");');
    const watcher = watcherJob().spawnWatcher(1);
    await untilEnded(watcherJob().jobFolder, 1);
    await Bun.sleep(LINGER_WATCHED_MILLISECONDS);
    expect(watcher.exitCode).toBeNull();
    expect(await WatcherFleet.reapEndedWatchers(ports, trackerDirectory)).toBe(1);
    expect(await watcher.exited).toBe(0);
  }, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);

  test('an ended process Watcher in its job\'s subfolder is reaped by the same sweep', async () => {
    const { watcherFolder, processId } = spawnProcessWatcher('gate-1', 'console.log("gate passed");');
    await untilEnded(watcherFolder, 1);
    expect(processIsGone(processId)).toBe(false);
    expect(await WatcherFleet.reapEndedWatchers(ports, trackerDirectory)).toBe(1);
    await untilGone(processId);
    expect(processIsGone(processId)).toBe(true);
  }, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);

  test('a Watcher still running its child is left alone', async () => {
    watcherJob().writeLaunch(1, 'agent', 'setInterval(() => undefined, 1000);');
    const watcher = watcherJob().spawnWatcher(1);
    const client = await watcherJob().attach(1);
    await client.nextFrame((frame) => frame.kind === 'welcome');
    expect(WatcherFleet.livenessOf(ports, watcherJob().jobFolder, 1).verdict).toBe('live');
    expect(await WatcherFleet.reapEndedWatchers(ports, trackerDirectory)).toBe(0);
    expect(watcher.exitCode).toBeNull();
    client.send({ kind: 'stop', graceMilliseconds: 0 });
    await untilEnded(watcherJob().jobFolder, 1);
    expect(await WatcherFleet.reapEndedHostsIn(ports, watcherJob().jobFolder)).toBe(1);
    expect(await watcher.exited).toBe(0);
  }, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);
});

describe('a Watcher started in a root that plants a bunfig preload', () => {
  test('never runs the preload', async () => {
    const plantedRoot = join(trackerDirectory, 'planted-root');
    const markerPath = join(plantedRoot, 'planted-preload-ran');
    mkdirSync(plantedRoot);
    writeFileSync(join(plantedRoot, 'bunfig.toml'), 'preload = ["./planted-preload.ts"]\n');
    writeFileSync(join(plantedRoot, 'planted-preload.ts'), `require('node:fs').writeFileSync(${JSON.stringify(markerPath)}, '');\n`);
    const { watcherFolder } = spawnProcessWatcher('gate-1', 'console.log("gate passed");', plantedRoot);
    await untilEnded(watcherFolder, 1);
    expect(existsSync(markerPath)).toBe(false);
    expect(await WatcherFleet.reapEndedWatchers(ports, trackerDirectory)).toBe(1);
  }, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);
});

describe('sending frames', () => {
  test('a send to a live Watcher reads its reply and settles on its close, long before the frame timeout', async () => {
    watcherJob().writeLaunch(1, 'agent', 'setInterval(() => undefined, 1000);');
    const watcher = watcherJob().spawnWatcher(1);
    await untilLive(watcherJob().jobFolder, 1);
    const sentWithinBound = async (frames: Parameters<typeof WatcherFleet.sendFrames>[3]): Promise<boolean | 'timed-out'> => {
      const timedOut = new Promise<'timed-out'>((resolve) => {
        setTimeout(() => resolve('timed-out'), SEND_SETTLE_BOUND_MILLISECONDS);
      });
      return await Promise.race([WatcherFleet.sendFrames(ports, watcherJob().jobFolder, 1, frames), timedOut]);
    };
    expect(await sentWithinBound([{ kind: 'write', line: 'example-line' }])).toBe(true);
    expect(await sentWithinBound([{ kind: 'stop', graceMilliseconds: 0 }])).toBe(true);
    await untilEnded(watcherJob().jobFolder, 1);
    expect(await WatcherFleet.reapEndedHostsIn(ports, watcherJob().jobFolder)).toBe(1);
    expect(await watcher.exited).toBe(0);
  }, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);
});

describe('stopping live process watchers', () => {
  test('a live gate Watcher is stopped and has recorded its end when the call answers; the reap then lets it exit', async () => {
    const { watcherFolder, processId } = spawnProcessWatcher('gate-1', 'setInterval(() => undefined, 1000);');
    await untilLive(watcherFolder, 1);
    expect(await WatcherFleet.stopLiveProcessWatchers(ports, trackerDirectory)).toBe(1);
    expect(WatcherFleet.livenessOf(ports, watcherFolder, 1).verdict).toBe('ended');
    expect(await WatcherFleet.reapEndedWatchers(ports, trackerDirectory)).toBe(1);
    await untilGone(processId);
  }, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);

  test('a live Watcher is left alone', async () => {
    watcherJob().writeLaunch(1, 'agent', 'setInterval(() => undefined, 1000);');
    const watcher = watcherJob().spawnWatcher(1);
    await untilLive(watcherJob().jobFolder, 1);
    expect(await WatcherFleet.stopLiveProcessWatchers(ports, trackerDirectory)).toBe(0);
    expect(WatcherFleet.livenessOf(ports, watcherJob().jobFolder, 1).verdict).toBe('live');
    const client = await watcherJob().attach(1);
    await client.nextFrame((frame) => frame.kind === 'welcome');
    client.send({ kind: 'stop', graceMilliseconds: 0 });
    await untilEnded(watcherJob().jobFolder, 1);
    expect(await WatcherFleet.reapEndedHostsIn(ports, watcherJob().jobFolder)).toBe(1);
    expect(await watcher.exited).toBe(0);
  }, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);
});
