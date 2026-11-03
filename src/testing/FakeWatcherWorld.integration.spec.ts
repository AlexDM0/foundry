/**
 * What keeps the fake Watcher world honest: one scenario and one process line, played once by the real Watcher from the pinned bundle and once
 * by `src/testing/FakeWatcherWorld.ts`. Only what a DrivePass reads matters: the event log's origins and lines, the record's end, and what a
 * frame sent after the end does. A default spec trusts the world only because these two agree.
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

import type { PlatformPorts }                      from '../lib/platform-ports/PlatformPortsFor.ts';
import type { ProcessStarts }                      from '../services/overseer/ProcessStarts.ts';
import { REAL_PROCESS_STARTS }                     from '../services/overseer/ProcessStarts.ts';
import { WatcherFleet }                            from '../services/overseer/WatcherFleet.ts';
import { workspacePathsFor }                       from '../services/tracker/Workspace.ts';
import { CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS } from './ChildProcessCaseTimeout.ts';
import { pinnedScratchWatcherBundle }              from './DrivePassHarness.ts';
import {
  fakeAgentAdapter,
  fakeAssistantTurnLine,
  type FakeAgentStep,
  fakeStartedLine
} from './FakeAgentAdapter.ts';
import { createFakeWatcherWorld, type FakeWatcherWorld }  from './FakeWatcherWorld.ts';
import { nativePlatformPorts }                            from './NativePlatformPorts.ts';
import { useRecordedGit }                                 from './RecordedGit.ts';
import { createScratchDirectory, removeScratchDirectory } from './ScratchWorkspace.ts';
import { waitUntil }                                      from './WaitUntil.ts';

const SCENARIO: readonly FakeAgentStep[] = [
  { kind: 'print', line: fakeStartedLine('fake-session') },
  { kind: 'await-line' },
  { kind: 'print', line: fakeAssistantTurnLine('after-the-first-line') },
  { kind: 'await-line' },
  { kind: 'await-line' },
];
const FAILING_LINE = 'echo expected 2, received 3; exit 4';
const RUNNING_LINE = 'sleep 300';
const EXAMPLE_JOB_ID = 'J1';

const nativePorts = nativePlatformPorts();
// The world reads HEAD only for a line naming it, which no case here sends: any git call fails the case.
useRecordedGit();

let repository = '';
let monitorFolder = '';
let world: FakeWatcherWorld;
let bundlePath = '';

interface Side {
  readonly name:          string;
  readonly ports:         () => PlatformPorts;
  readonly processStarts: () => ProcessStarts;
}

const SIDES: readonly Side[] = [
  { name: 'real', ports: () => nativePorts, processStarts: () => REAL_PROCESS_STARTS },
  { name: 'fake', ports: () => world.ports, processStarts: () => world.processStarts },
];

function launchAgent(side: Side): string {
  const jobFolder = join(repository, side.name, EXAMPLE_JOB_ID);
  mkdirSync(jobFolder, { recursive: true });
  const adapter = fakeAgentAdapter(SCENARIO);
  WatcherFleet.writeLaunchFiles(side.ports(), {
    jobFolder,
    instance:           1,
    jobId:              `${side.name}-agent`,
    trackerId:          'example',
    monitorFolder,
    watcherCodeVersion: 'code-example',
    workingDirectory:   repository,
    plan:               adapter.planOf({ jobFilesDirectory: jobFolder, environment: {} } as never),
  });
  side.processStarts().spawnWatcher(side.ports(), {
    bundlePath, jobFolder, instance: 1, rootDirectory: repository
  });
  return jobFolder;
}

function launchProcess(side: Side, line = FAILING_LINE): string {
  const watcherFolder = join(repository, side.name, 'gate-1');
  WatcherFleet.writeProcessLaunchFile(side.ports(), {
    watcherFolder,
    instance:           1,
    jobId:              `${side.name}-process`,
    socketName:         `${side.name}-gate`,
    trackerId:          'example',
    monitorFolder,
    watcherCodeVersion: 'code-example',
    workingDirectory:   repository,
    argv:               nativePorts.shellLine.spawnRequestOf(line, join(repository, 'line-status')).argv,
    environment:        { PATH: '/usr/bin:/bin' },
  });
  side.processStarts().spawnWatcher(side.ports(), {
    bundlePath, jobFolder: watcherFolder, instance: 1, rootDirectory: repository
  });
  return watcherFolder;
}

function logOf(jobFolder: string): { origin: string; line: string }[] {
  const entries = WatcherFleet.eventsAfter(jobFolder, 1, 0);
  return entries === 'malformed' ? [] : entries.map(({ origin, line }) => ({ origin, line }));
}

async function playedAgent(side: Side): Promise<unknown> {
  const jobFolder = launchAgent(side);
  await waitUntil(() => logOf(jobFolder).length > 0 && WatcherFleet.livenessOf(side.ports(), jobFolder, 1).verdict === 'live', 'the session starting');
  for (const line of ['Example first line', 'Example second line']) {
    await waitUntil(async () => await WatcherFleet.sendFrames(side.ports(), jobFolder, 1, [{ kind: 'write', line }]), 'the frame being taken');
    await waitUntil(() => logOf(jobFolder).some((entry) => entry.line.includes(line)), 'the frame being logged');
  }
  await WatcherFleet.sendFrames(side.ports(), jobFolder, 1, [{ kind: 'close-input' }]);
  await waitUntil(() => WatcherFleet.livenessOf(side.ports(), jobFolder, 1).verdict === 'ended', 'the session ending');
  const liveness = WatcherFleet.livenessOf(side.ports(), jobFolder, 1);
  const reaped = await WatcherFleet.reapEndedHostsIn(side.ports(), jobFolder);
  const watcherProcess = WatcherFleet.watcherRecordOf(jobFolder, 1)?.watcher?.processId ?? 0;
  await waitUntil(() => side.ports().processSupervision.processIsGone(watcherProcess), 'the acknowledged Watcher exiting');
  return { log: logOf(jobFolder), liveness, reaped };
}

async function playedProcess(side: Side): Promise<unknown> {
  const watcherFolder = launchProcess(side);
  await waitUntil(() => WatcherFleet.livenessOf(side.ports(), watcherFolder, 1).verdict === 'ended', 'the process ending');
  const reaped = await WatcherFleet.reapEndedHostsIn(side.ports(), watcherFolder);
  return { log: logOf(watcherFolder), liveness: WatcherFleet.livenessOf(side.ports(), watcherFolder, 1), reaped };
}

/** A line that runs until a `stop` frame ends it, and the Watcher that exits on the acknowledgement after it. */
async function playedStoppedProcess(side: Side): Promise<unknown> {
  const watcherFolder = launchProcess(side, RUNNING_LINE);
  await waitUntil(() => WatcherFleet.livenessOf(side.ports(), watcherFolder, 1).verdict === 'live', 'the process going live');
  await waitUntil(async () => await WatcherFleet.sendFrames(side.ports(), watcherFolder, 1, [{ kind: 'stop', graceMilliseconds: 0 }]), 'the stop being taken');
  await waitUntil(() => WatcherFleet.livenessOf(side.ports(), watcherFolder, 1).verdict === 'ended', 'the process ending');
  const { end } = WatcherFleet.watcherRecordOf(watcherFolder, 1) ?? {};
  const reaped = await WatcherFleet.reapEndedHostsIn(side.ports(), watcherFolder);
  const watcherProcess = WatcherFleet.watcherRecordOf(watcherFolder, 1)?.watcher?.processId ?? 0;
  await waitUntil(() => side.ports().processSupervision.processIsGone(watcherProcess), 'the acknowledged Watcher exiting');
  return { end, reaped };
}

beforeEach(async () => {
  repository = createScratchDirectory('fake-watcher-world');
  monitorFolder = createScratchDirectory('h');
  world = createFakeWatcherWorld(nativePorts);
  world.scriptLine(FAILING_LINE, { exitCode: 4, output: 'expected 2, received 3\n' });
  world.scriptLine(RUNNING_LINE, { runsUntilStopped: true });
  bundlePath = await pinnedScratchWatcherBundle(workspacePathsFor(repository));
});

afterEach(() => {
  removeScratchDirectory(monitorFolder);
  removeScratchDirectory(repository);
});

describe('the fake world against the real Watcher', () => {
  test('a session leaves the same log lines and the same end, and an ended Watcher exits on its acknowledgement', async () => {
    const [real, fake] = SIDES;
    if (real === undefined || fake === undefined) throw new Error('both sides are listed');
    expect(await playedAgent(fake)).toEqual(await playedAgent(real));
  }, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);

  test('a process line leaves the same output and the same end', async () => {
    const [real, fake] = SIDES;
    if (real === undefined || fake === undefined) throw new Error('both sides are listed');
    expect(await playedProcess(fake)).toEqual(await playedProcess(real));
  }, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);

  test('a stopped process line leaves the same end, and its Watcher exits on the acknowledgement', async () => {
    const [real, fake] = SIDES;
    if (real === undefined || fake === undefined) throw new Error('both sides are listed');
    expect(await playedStoppedProcess(fake)).toEqual(await playedStoppedProcess(real));
  }, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);
});
