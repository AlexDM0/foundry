/**
 * The Overseer's reaping of ended Watchers, over `src/testing/FakeWatcherWorld.ts`, so nothing starts. What matters: the sweep over the tracker's
 * job folders acknowledges an ended Watcher, a Watcher and a process Watcher in its job's subfolder alike, so that it is gone; a Watcher still
 * running is never touched; `stopLiveProcessWatchers` stops a live process Watcher and waits for its recorded end, but never touches a Watcher.
 * `src/services/overseer/WatcherFleet.integration.spec.ts` holds the same against the real Watcher binary.
 */
import { mkdirSync } from 'node:fs';
import { join }      from 'node:path';

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  test
} from 'bun:test';

import { FAKE_WATCHER_BUNDLE_PATH }                       from '../../testing/DrivePassHarness.ts';
import { fakeAgentAdapter, type FakeAgentStep }           from '../../testing/FakeAgentAdapter.ts';
import { createFakeWatcherWorld, type FakeWatcherWorld }  from '../../testing/FakeWatcherWorld.ts';
import { nativePlatformPorts }                            from '../../testing/NativePlatformPorts.ts';
import { createScratchDirectory, removeScratchDirectory } from '../../testing/ScratchWorkspace.ts';
import { WatcherFleet }                                   from './WatcherFleet.ts';

const JOB_IDENTIFIER = 'J-1';
const RUNNING_LINE = 'example-running-line';
const ENDING_LINE = 'example-ending-line';
const ENDS_AT_ONCE: readonly FakeAgentStep[] = [];
const WAITS_FOR_A_LINE: readonly FakeAgentStep[] = [{ kind: 'await-line' }];

let world: FakeWatcherWorld;
let trackerDirectory = '';
let monitorFolder = '';

function jobFolder(): string {
  return WatcherFleet.jobFolderOf(trackerDirectory, JOB_IDENTIFIER);
}

function verdictOf(watcherFolder: string): string {
  return WatcherFleet.livenessOf(world.ports, watcherFolder, 1).verdict;
}

function isGone(watcherProcessId: number | undefined): boolean {
  return world.ports.processSupervision.processIsGone(watcherProcessId ?? 0);
}

/** A Watcher, instance 1, in the job folder, playing `scenario`. */
function spawnAgentWatcher(scenario: readonly FakeAgentStep[]): number | undefined {
  WatcherFleet.writeLaunchFiles(world.ports, {
    jobFolder:          jobFolder(),
    instance:           1,
    jobId:              JOB_IDENTIFIER,
    trackerId:          'tracker-example',
    monitorFolder,
    watcherCodeVersion: 'code-example',
    workingDirectory:   jobFolder(),
    plan:               fakeAgentAdapter(scenario).planOf({ jobFilesDirectory: jobFolder(), environment: {} } as never),
  });
  return world.processStarts.spawnWatcher(world.ports, {
    bundlePath: FAKE_WATCHER_BUNDLE_PATH, jobFolder: jobFolder(), instance: 1, rootDirectory: jobFolder()
  });
}

/** A process Watcher, instance 1, in the job's subfolder `subfolderName`, running `line`. */
function spawnProcessWatcher(subfolderName: string, line: string): { watcherFolder: string; processId: number | undefined } {
  const watcherFolder = join(jobFolder(), subfolderName);
  WatcherFleet.writeProcessLaunchFile(world.ports, {
    watcherFolder,
    instance:           1,
    jobId:              JOB_IDENTIFIER,
    socketName:         `${JOB_IDENTIFIER}/${subfolderName}`,
    trackerId:          'tracker-example',
    monitorFolder,
    watcherCodeVersion: 'code-example',
    workingDirectory:   watcherFolder,
    argv:               [line],
    environment:        {},
  });
  const processId = world.processStarts.spawnWatcher(world.ports, {
    bundlePath: FAKE_WATCHER_BUNDLE_PATH, jobFolder: watcherFolder, instance: 1, rootDirectory: watcherFolder
  });
  return { watcherFolder, processId };
}

beforeEach(() => {
  world = createFakeWatcherWorld(nativePlatformPorts());
  world.scriptLine(RUNNING_LINE, { runsUntilStopped: true });
  world.scriptLine(ENDING_LINE, {});
  trackerDirectory = createScratchDirectory('tracker');
  monitorFolder = createScratchDirectory('h');
  mkdirSync(jobFolder(), { recursive: true });
});

afterEach(() => {
  removeScratchDirectory(trackerDirectory);
  removeScratchDirectory(monitorFolder);
});

describe('reaping ended watchers', () => {
  test('an ended Watcher runs until the sweep acknowledges its end, then is gone', async () => {
    const processId = spawnAgentWatcher(ENDS_AT_ONCE);
    expect(verdictOf(jobFolder())).toBe('ended');
    expect(isGone(processId)).toBe(false);
    expect(await WatcherFleet.reapEndedWatchers(world.ports, trackerDirectory)).toBe(1);
    expect(isGone(processId)).toBe(true);
  });

  test('an ended process Watcher in its job\'s subfolder is reaped by the same sweep', async () => {
    const { watcherFolder, processId } = spawnProcessWatcher('gate-1', ENDING_LINE);
    expect(verdictOf(watcherFolder)).toBe('ended');
    expect(isGone(processId)).toBe(false);
    expect(await WatcherFleet.reapEndedWatchers(world.ports, trackerDirectory)).toBe(1);
    expect(isGone(processId)).toBe(true);
  });

  test('a Watcher still running its child is left alone', async () => {
    const processId = spawnAgentWatcher(WAITS_FOR_A_LINE);
    expect(verdictOf(jobFolder())).toBe('live');
    expect(await WatcherFleet.reapEndedWatchers(world.ports, trackerDirectory)).toBe(0);
    expect(isGone(processId)).toBe(false);
    expect(await WatcherFleet.sendFrames(world.ports, jobFolder(), 1, [{ kind: 'close-input' }])).toBe(true);
    expect(verdictOf(jobFolder())).toBe('ended');
    expect(await WatcherFleet.reapEndedHostsIn(world.ports, jobFolder())).toBe(1);
    expect(isGone(processId)).toBe(true);
  });
});

describe('stopping live process watchers', () => {
  test('a live gate Watcher is stopped and has recorded its end when the call answers; the reap then lets it exit', async () => {
    const { watcherFolder, processId } = spawnProcessWatcher('gate-1', RUNNING_LINE);
    expect(verdictOf(watcherFolder)).toBe('live');
    expect(await WatcherFleet.stopLiveProcessWatchers(world.ports, trackerDirectory)).toBe(1);
    expect(verdictOf(watcherFolder)).toBe('ended');
    expect(await WatcherFleet.reapEndedWatchers(world.ports, trackerDirectory)).toBe(1);
    expect(isGone(processId)).toBe(true);
  });

  test('a live Watcher is left alone', async () => {
    const processId = spawnAgentWatcher(WAITS_FOR_A_LINE);
    expect(await WatcherFleet.stopLiveProcessWatchers(world.ports, trackerDirectory)).toBe(0);
    expect(verdictOf(jobFolder())).toBe('live');
    expect(isGone(processId)).toBe(false);
  });
});
