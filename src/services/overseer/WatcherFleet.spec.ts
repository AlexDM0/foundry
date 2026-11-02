/**
 * The Overseer's reaping of ended Watchers, over `src/testing/FakeWatcherWorld.ts`, so nothing starts. What matters: the sweep over the tracker's
 * job folders acknowledges an ended Watcher, a Watcher and a process Watcher in its job's subfolder alike, so that it is gone; a Watcher still
 * running is never touched; `stopLiveProcessWatchers` stops a live process Watcher and waits for its recorded end, but never touches a Watcher.
 * No launch file holds a secret: each one names an owner-only file under the monitor folder, and a refused restriction leaves no launch file.
 * `src/services/overseer/WatcherFleet.integration.spec.ts` holds the same against the real Watcher binary.
 */
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync
} from 'node:fs';
import { dirname, join } from 'node:path';

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  test
} from 'bun:test';

import { localEndpointFor }                               from '../../lib/watcher/LocalEndpointFor.ts';
import { watcherFilesOf }                                 from '../../lib/watcher/WatcherFiles.ts';
import { refusalIsOperationRefusal }                      from '../../shared/OperationRefusal.ts';
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

describe('the Watcher secret', () => {
  function assertSecretIsOnlyInTheOwnerOnlyFolder(launchFolder: string, secretName: string): void {
    const launchText = readFileSync(watcherFilesOf(launchFolder, 1).launchPath, 'utf8');
    const { secretFilePath } = JSON.parse(launchText) as { secretFilePath: string };
    expect(secretFilePath).toBe(join(monitorFolder, 'watchers', 'tracker-example', secretName));
    const secret = readFileSync(secretFilePath, 'utf8');
    expect(secret).toMatch(/^[0-9a-f]{48}$/);
    expect(launchText).not.toContain(secret);
    expect(launchText).not.toContain('watcherSecret');
    expect(statSync(secretFilePath).mode & 0o777).toBe(0o600);
    expect(statSync(dirname(secretFilePath)).mode & 0o777).toBe(0o700);
    expect(world.ports.ownerOnlyFiles.isOwnerOnly(secretFilePath)).toBe(true);
  }

  test('an agent launch file names the owner-only file and holds no secret', () => {
    spawnAgentWatcher(WAITS_FOR_A_LINE);
    assertSecretIsOnlyInTheOwnerOnlyFolder(jobFolder(), `${JOB_IDENTIFIER}-1.secret`);
  });

  test('a process launch file does too, its slash in the socket name a subfolder', () => {
    const { watcherFolder } = spawnProcessWatcher('gate-1', RUNNING_LINE);
    const [secretFilePath = ''] = readdirSync(join(monitorFolder, 'watchers', 'tracker-example'), { recursive: true, encoding: 'utf8' }).filter((path) => path.endsWith('.secret'));
    assertSecretIsOnlyInTheOwnerOnlyFolder(watcherFolder, secretFilePath);
  });

  test('a restriction the port refuses stops the launch file being written', () => {
    const ports = {
      ...world.ports,
      ownerOnlyFiles: {
        ...world.ports.ownerOnlyFiles,
        restrictFile: () => {
          throw new Error('example ACL refusal');
        },
      },
    };
    expect(() => WatcherFleet.writeProcessLaunchFile(ports, {
      watcherFolder:      jobFolder(),
      instance:           1,
      jobId:              JOB_IDENTIFIER,
      socketName:         JOB_IDENTIFIER,
      trackerId:          'tracker-example',
      monitorFolder,
      watcherCodeVersion: 'code-example',
      workingDirectory:   jobFolder(),
      argv:               [RUNNING_LINE],
      environment:        {},
    })).toThrow('example ACL refusal');
    expect(existsSync(watcherFilesOf(jobFolder(), 1).launchPath)).toBe(false);
  });

  const LONG_HOME = `/${'h'.repeat(120)}`;

  test.each([
    ['macOS', () => localEndpointFor('darwin', 'example-product')],
    ['Linux', () => localEndpointFor('linux', 'example-product')],
    ['Windows, whose name holds no home and only a prefix can overflow', () => localEndpointFor('win32', 'p'.repeat(300))],
    ['a platform with no adapter', () => localEndpointFor('example-os', 'example-product')],
  ])('a Watcher endpoint that does not fit on %s is refused in words before any launch file exists', (_platform, endpointOfPlatform) => {
    const ports = { ...world.ports, localEndpoint: endpointOfPlatform() };
    const request = {
      watcherFolder:      jobFolder(),
      instance:           1,
      jobId:              JOB_IDENTIFIER,
      socketName:         JOB_IDENTIFIER,
      trackerId:          'tracker-example',
      monitorFolder:      LONG_HOME,
      watcherCodeVersion: 'code-example',
      workingDirectory:   jobFolder(),
      argv:               [RUNNING_LINE],
      environment:        {},
    };
    expect(WatcherFleet.unfitEndpointOf(ports, { ...request, jobId: request.socketName })).not.toBeNull();
    let refusal: unknown = null;
    try {
      WatcherFleet.writeProcessLaunchFile(ports, request);
    } catch (thrown) {
      refusal = thrown;
    }
    expect(refusalIsOperationRefusal(refusal) ? refusal.status : null).toBe('refused');
    expect(refusalIsOperationRefusal(refusal) ? refusal.detail?.kind : null).toBe('watcher-endpoint-does-not-fit');
    expect(existsSync(watcherFilesOf(jobFolder(), 1).launchPath)).toBe(false);
  });

  test('an endpoint that fits is no refusal', () => {
    expect(WatcherFleet.unfitEndpointOf(world.ports, {
      monitorFolder, trackerId: 'tracker-example', jobId: JOB_IDENTIFIER, instance: 1
    })).toBeNull();
  });
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

  test.each([
    ['a tree member outlives the stop', [{ processId: 5001, startStamp: '2', processGroupId: 5001 }]],
    ['the tree cannot be read', null],
  ] as const)('a stopped gate Watcher is not counted when %s, and the read is given the listing from before the stop', async (_case, listing) => {
    const { watcherFolder } = spawnProcessWatcher('gate-1', RUNNING_LINE);
    const { processSupervision } = world.ports;
    const earlierListings: unknown[] = [];
    const before = [{ processId: 5002, startStamp: '2', processGroupId: 5002 }];
    const ports = {
      ...world.ports,
      processSupervision: {
        ...processSupervision,
        treeMembersOf: (_leader: unknown, earlierMembers: unknown) => {
          earlierListings.push(earlierMembers);
          return earlierListings.length === 1 ? before : listing;
        },
      },
    };
    expect(await WatcherFleet.stopLiveProcessWatchers(ports, trackerDirectory)).toBe(0);
    expect(verdictOf(watcherFolder)).toBe('ended');
    expect(earlierListings.at(-1)).toEqual(before);
  });

  test('a live Watcher is left alone', async () => {
    const processId = spawnAgentWatcher(WAITS_FOR_A_LINE);
    expect(await WatcherFleet.stopLiveProcessWatchers(world.ports, trackerDirectory)).toBe(0);
    expect(verdictOf(jobFolder())).toBe('live');
    expect(isGone(processId)).toBe(false);
  });
});
