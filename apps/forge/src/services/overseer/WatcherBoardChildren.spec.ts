/**
 * The mapping of the Watchers onto `BoardChildren`, over planted Watcher files and a spawn that starts nothing. What matters: an unclaimed
 * Watcher reads as a child not launched; an ended Watcher's end keeps its reason, exit code and signal, and an end where no child ran reads
 * as a failed spawn naming why; a claimed Watcher reads as a child starting, a running one as running; no ending is ever recognised. A
 * launch writes the launch file and spawns its Watcher where the facts say Watchers run, and a Watcher spawned and not yet claimed reads
 * as a child starting under it; a reader made to launch nothing answers that nothing can launch.
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join }                                 from 'node:path';

import {
  afterEach,
  describe,
  expect,
  test
} from 'bun:test';

import type { AgentLaunchPlan }                                  from '../../lib/agent-launch/AgentLaunchPlan.ts';
import type { PlatformPorts }                                    from '../../lib/platform-ports/PlatformPortsFor.ts';
import type { ProcessIdentity }                                  from '../../lib/process-identity/ProcessIdentity.ts';
import { watcherFilesOf }                                        from '../../lib/watcher/WatcherFiles.ts';
import { type WatcherRecord, watcherRecordTextOf }               from '../../lib/watcher/WatcherRecord.ts';
import { nativePlatformPorts }                                   from '../../testing/NativePlatformPorts.ts';
import { createScratchDirectory, removeScratchDirectory }        from '../../testing/ScratchWorkspace.ts';
import type { ProcessStarts }                                    from './ProcessStarts.ts';
import { createWatcherBoardChildren, type WatcherBoardChildren } from './WatcherBoardChildren.ts';

const WATCHER_IDENTITY: ProcessIdentity = { processId: 4242, startStamp: '1', bootIdentity: 'example-boot' };
const CHILD_IDENTITY: ProcessIdentity = { processId: 4243, startStamp: '2', bootIdentity: 'example-boot' };
const SPAWNED_WATCHER_PROCESS_ID = 4244;
const EXAMPLE_PLAN: AgentLaunchPlan = {
  argv: ['example-agent'], environment: {}, files: [], standingReplies: [], closingLine: null, endingPatterns: [], quitAtTurnEnd: null
};

const scratchDirectories: string[] = [];

afterEach(() => {
  for (const directory of scratchDirectories.splice(0)) removeScratchDirectory(directory);
});

/** Every process the case names is alive and is the process it was recorded as. */
function portsWhereEveryRecordedProcessRuns(): PlatformPorts {
  const native = nativePlatformPorts();
  return {
    ...native,
    processSupervision: {
      ...native.processSupervision,
      identityOf:  (processId) => ({ ...WATCHER_IDENTITY, processId }),
      sameProcess: () => true,
    },
  };
}

interface ChildrenScene {
  readonly children:         WatcherBoardChildren;
  readonly childFolder:      string;
  readonly spawnRequests:    { jobFolder: string; instance: number; rootDirectory: string }[];
  readonly watcherDirectory: string;
}

function childrenScene(launches: boolean): ChildrenScene {
  const scratch = createScratchDirectory('board-children');
  scratchDirectories.push(scratch);
  const trackerDirectory = join(scratch, 'tracker');
  const childFolder = join(trackerDirectory, 'jobs', 'J1');
  mkdirSync(childFolder, { recursive: true });
  const spawnRequests: ChildrenScene['spawnRequests'] = [];
  const processStarts = {
    spawnWatcher: (_ports: unknown, request: ChildrenScene['spawnRequests'][number]) => {
      spawnRequests.push(request);
      return SPAWNED_WATCHER_PROCESS_ID;
    },
  } as unknown as ProcessStarts;
  const watcherDirectory = join(scratch, 'watchers-run-here');
  const children = createWatcherBoardChildren({
    platformPorts: portsWhereEveryRecordedProcessRuns(),
    trackerDirectory,
    launching:     launches
      ? {
        trackerId: 'tracker-example', monitorFolder: join(scratch, 'm'), watcherBundlePath: '/example/watcher.js', codeVersion: 'code-example', watcherDirectory, processStarts
      }
      : null,
    log: () => undefined,
  });
  return {
    children, childFolder, spawnRequests, watcherDirectory
  };
}

function plantRecord(childFolder: string, record: Partial<WatcherRecord>): void {
  const planted: WatcherRecord = {
    protocolVersion: 1, eventLogFormatVersion: 2, watcherInstance: 1, state: 'running', watcher: WATCHER_IDENTITY, childProcess: CHILD_IDENTITY, ...record,
  };
  writeFileSync(watcherFilesOf(childFolder, 1).watcherRecordPath, watcherRecordTextOf(planted));
}

describe('a Watcher read as a child', () => {
  test('one never claimed is not launched, and its record is none', () => {
    const { children, childFolder } = childrenScene(false);
    expect(children.livenessOf(childFolder, 1)).toEqual({ verdict: 'unlaunched' });
    expect(children.recordOf(childFolder, 1)).toBeNull();
  });

  test('one claimed is a child starting, one whose child runs is a child running', () => {
    const { children, childFolder } = childrenScene(false);
    plantRecord(childFolder, { state: 'claimed' });
    expect(children.livenessOf(childFolder, 1)).toEqual({ verdict: 'live', state: 'starting' });
    plantRecord(childFolder, { state: 'running' });
    expect(children.livenessOf(childFolder, 1)).toEqual({ verdict: 'live', state: 'running' });
    expect(children.recordOf(childFolder, 1)).toMatchObject({
      state: 'running', talos: WATCHER_IDENTITY, childProcess: CHILD_IDENTITY, end: null
    });
  });

  test('an ended one keeps its reason, exit code and signal', () => {
    const { children, childFolder } = childrenScene(false);
    plantRecord(childFolder, { state: 'ended', end: { reason: 'exited', exitCode: 3, signal: null } });
    expect(children.livenessOf(childFolder, 1)).toEqual({
      verdict: 'ended',
      end:     {
        reason: 'exited', exitCode: 3, signal: null, detail: null, runMilliseconds: 0
      }
    });
    plantRecord(childFolder, { state: 'ended', end: { reason: 'signalled', exitCode: null, signal: 'SIGTERM' } });
    expect(children.livenessOf(childFolder, 1)).toMatchObject({ verdict: 'ended', end: { reason: 'signalled', exitCode: null, signal: 'SIGTERM' } });
  });

  test('an end where no child ran is a failed spawn naming why', () => {
    const { children, childFolder } = childrenScene(false);
    plantRecord(childFolder, {
      state: 'ended',
      end:   {
        reason: 'socket-unbindable', exitCode: null, signal: null, detail: 'example reason'
      }
    });
    expect(children.livenessOf(childFolder, 1)).toMatchObject({ verdict: 'ended', end: { reason: 'spawn-failed', detail: 'example reason' } });
  });

  test('no ending is ever recognised', () => {
    const { children, childFolder } = childrenScene(false);
    plantRecord(childFolder, { state: 'ended', end: { reason: 'exited', exitCode: 0, signal: null } });
    expect(children.recognisedEndingsOf(childFolder, 1)).toEqual([]);
  });

  test('the newest instance is the highest claimed one', () => {
    const { children, childFolder } = childrenScene(false);
    expect(children.newestInstanceIn(childFolder)).toBeNull();
    writeFileSync(watcherFilesOf(childFolder, 3).watcherRecordPath, '{}\n');
    plantRecord(childFolder, {});
    expect(children.newestInstanceIn(childFolder)).toBe(3);
  });
});

describe('a launch', () => {
  test('of a line writes its launch file and spawns its Watcher where Watchers run, which reads as starting until it claims', async () => {
    const {
      children, childFolder, spawnRequests, watcherDirectory
    } = childrenScene(true);
    const lineFolder = join(childFolder, 'install-1');
    const outcome = await children.launchLine({
      childFolder:           lineFolder,
      instance:              1,
      label:                 'J1/install-1',
      workingDirectory:      childFolder,
      argv:                  ['example-install'],
      verbatimArguments:     false,
      environment:           {},
      timeBoundMilliseconds: null,
    });
    expect(outcome).toEqual({ verdict: 'launched' });
    expect(existsSync(watcherFilesOf(lineFolder, 1).launchPath)).toBe(true);
    expect(spawnRequests).toEqual([expect.objectContaining({ jobFolder: lineFolder, instance: 1, rootDirectory: watcherDirectory })]);
    expect(children.livenessOf(lineFolder, 1)).toEqual({ verdict: 'unlaunched' });
    expect(children.recordOf(lineFolder, 1)).toMatchObject({ kind: 'line', state: 'starting', talos: { processId: SPAWNED_WATCHER_PROCESS_ID } });
  });

  test('of an agent writes its launch file and spawns its Watcher', async () => {
    const { children, childFolder, spawnRequests } = childrenScene(true);
    const outcome = await children.launchAgent({
      childFolder,
      instance:                       1,
      label:                          'J1',
      workingDirectory:               childFolder,
      plan:                           EXAMPLE_PLAN,
      treeStopAtEndGraceMilliseconds: null,
    });
    expect(outcome).toEqual({ verdict: 'launched' });
    expect(existsSync(watcherFilesOf(childFolder, 1).launchPath)).toBe(true);
    expect(spawnRequests).toHaveLength(1);
  });

  test('from a reader made to launch nothing answers that nothing can launch, and spawns nothing', async () => {
    const { children, childFolder, spawnRequests } = childrenScene(false);
    expect(await children.launchAgent({
      childFolder,
      instance:                       1,
      label:                          'J1',
      workingDirectory:               childFolder,
      plan:                           EXAMPLE_PLAN,
      treeStopAtEndGraceMilliseconds: null
    })).toEqual({ verdict: 'talos-unavailable' });
    expect(spawnRequests).toEqual([]);
  });
});
