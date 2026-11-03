/**
 * The recorded Watcher stages may give only what a real Watcher left. What matters is that a stage with no recorded answer fails the case,
 * that a process line ends with the recorded end at its own exit code, that an acknowledgement keeps the record of the stage that ended the
 * Watcher, and that the tree of an ended child is answered only from a stage that recorded it.
 */
import { join } from 'node:path';

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  test
} from 'bun:test';

import { WatcherFleet }                                                      from '../services/overseer/WatcherFleet.ts';
import { FAKE_WATCHER_BUNDLE_PATH }                                          from './DrivePassHarness.ts';
import { nativePlatformPorts }                                               from './NativePlatformPorts.ts';
import { type ControlledRecordedWatcherStages, createRecordedWatcherStages } from './RecordedWatcherStages.ts';
import { createScratchDirectory, removeScratchDirectory }                    from './ScratchWorkspace.ts';

const nativePorts = nativePlatformPorts();
const GREEN_LINE = 'example-green-line';
const RED_LINE = 'example-red-line';
const RUNNING_LINE = 'example-running-line';
const RED_EXIT_CODE = 4;

let trackerDirectory = '';
let monitorFolder = '';
let lastGateNumber = 0;

beforeEach(() => {
  trackerDirectory = createScratchDirectory('tracker');
  monitorFolder = createScratchDirectory('h');
});

afterEach(() => {
  removeScratchDirectory(trackerDirectory);
  removeScratchDirectory(monitorFolder);
});

function stagesWith(answers?: ReadonlyMap<string, unknown>): ControlledRecordedWatcherStages {
  const controlled = createRecordedWatcherStages(nativePorts, answers);
  controlled.stages.scriptLine(GREEN_LINE, {});
  controlled.stages.scriptLine(RED_LINE, { exitCode: RED_EXIT_CODE });
  controlled.stages.scriptLine(RUNNING_LINE, { runsUntilStopped: true });
  return controlled;
}

function spawnProcessWatcher({ stages }: ControlledRecordedWatcherStages, line: string): string {
  lastGateNumber += 1;
  const watcherFolder = join(WatcherFleet.jobFolderOf(trackerDirectory, 'J-1'), `gate-${lastGateNumber}`);
  WatcherFleet.writeProcessLaunchFile(stages.ports, {
    watcherFolder,
    instance:           1,
    jobId:              'J-1',
    socketName:         `J-1/gate-${lastGateNumber}`,
    trackerId:          'tracker-example',
    monitorFolder,
    watcherCodeVersion: 'code-example',
    workingDirectory:   watcherFolder,
    argv:               [line],
    environment:        {},
  });
  stages.processStarts.spawnWatcher(stages.ports, {
    bundlePath: FAKE_WATCHER_BUNDLE_PATH, jobFolder: watcherFolder, instance: 1, rootDirectory: watcherFolder
  });
  return watcherFolder;
}

describe('a stage with no recorded answer', () => {
  test('a spawn with no recorded launch throws and is kept for the case to fail on', () => {
    const controlled = stagesWith(new Map());
    expect(() => spawnProcessWatcher(controlled, GREEN_LINE)).toThrow('watcher stage "launch and claim" has no recorded answer');
    expect(controlled.takeUnansweredCalls()).toEqual([expect.stringContaining('launch and claim') as string]);
  });

  test('the tree of a child ended by a stage that recorded no tree is no answer', () => {
    const controlled = stagesWith();
    const watcherFolder = spawnProcessWatcher(controlled, GREEN_LINE);
    const child = WatcherFleet.watcherRecordOf(watcherFolder, 1)?.childProcess ?? null;
    if (child === null) throw new Error('the recorded launch names no child');
    expect(() => controlled.stages.ports.processSupervision.treeMembersOf(child, [])).toThrow('has no recorded answer');
    expect(controlled.takeUnansweredCalls()).toHaveLength(1);
  });
});

describe('the recorded answers', () => {
  test.each([
    ['green', GREEN_LINE, 0],
    ['red', RED_LINE, RED_EXIT_CODE],
  ])('a %s process line ends with the recorded end at its own exit code', (_case, line, exitCode) => {
    const controlled = stagesWith();
    const watcherFolder = spawnProcessWatcher(controlled, line);
    expect(WatcherFleet.watcherRecordOf(watcherFolder, 1)).toMatchObject({ state: 'ended', end: { reason: 'exited', exitCode, signal: null } });
    expect(WatcherFleet.livenessOf(controlled.stages.ports, watcherFolder, 1).verdict).toBe('ended');
    expect(controlled.takeUnansweredCalls()).toEqual([]);
  });

  test('the acknowledgement lets the Watcher exit and keeps the record of the stage that ended it', async () => {
    const controlled = stagesWith();
    const watcherFolder = spawnProcessWatcher(controlled, RED_LINE);
    const endedRecord = WatcherFleet.watcherRecordOf(watcherFolder, 1);
    expect(await WatcherFleet.reapEndedHostsIn(controlled.stages.ports, watcherFolder)).toBe(1);
    expect(WatcherFleet.watcherRecordOf(watcherFolder, 1)).toEqual(endedRecord);
    expect(controlled.stages.ports.processSupervision.processIsGone(endedRecord?.watcher?.processId ?? 0)).toBe(true);
    expect(controlled.takeUnansweredCalls()).toEqual([]);
  });

  test('a line stopped by the Overseer ends signalled, and the tree of its child after the stop is the recorded one', async () => {
    const controlled = stagesWith();
    const watcherFolder = spawnProcessWatcher(controlled, RUNNING_LINE);
    expect(await WatcherFleet.stopLiveProcessWatchers(controlled.stages.ports, trackerDirectory)).toBe(1);
    expect(WatcherFleet.watcherRecordOf(watcherFolder, 1)).toMatchObject({ state: 'ended', end: { reason: 'signalled', exitCode: null } });
    expect(controlled.takeUnansweredCalls()).toEqual([]);
  });
});
