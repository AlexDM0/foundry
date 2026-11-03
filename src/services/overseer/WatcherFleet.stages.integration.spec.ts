/**
 * The real Watcher, spawned from the pinned bundle as the Overseer spawns it, walked through each stage of a job; under
 * `bun run record src/lib/watcher/Watcher.ts` each stage's answer is recorded for `src/testing/RecordedWatcherStages.ts`. What matters is
 * what a DrivePass reads: the Watcher record, the origin of each event log line, the frames an attached client gets, and whether the Watcher
 * and its child still run. A stage settles on what the Watcher wrote, never on a clock.
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

import type { ActingFrame, WatcherFrame }                              from '../../lib/watcher/@types/WatcherFrame.ts';
import { watcherFilesOf }                                              from '../../lib/watcher/WatcherFiles.ts';
import { readWatcherLaunch, readWatcherSecret }                        from '../../lib/watcher/WatcherLaunch.ts';
import { WATCHER_PROTOCOL_VERSION }                                    from '../../lib/watcher/constants/WatcherProtocol.ts';
import { CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS }                     from '../../testing/ChildProcessCaseTimeout.ts';
import { pinnedScratchWatcherBundle }                                  from '../../testing/DrivePassHarness.ts';
import { fakeAgentAdapter, fakeAssistantTurnLine, type FakeAgentStep } from '../../testing/FakeAgentAdapter.ts';
import { nativePlatformPorts }                                         from '../../testing/NativePlatformPorts.ts';
import { recordAnswer }                                                from '../../testing/RecordedAnswers.ts';
import {
  asRecordedWatcherStage,
  type WatcherStage,
  type WatcherStageAnswer,
  watcherStageCallShapeOf,
  WATCHER_STAGES
} from '../../testing/RecordedWatcherStages.ts';
import { createScratchDirectory, removeScratchDirectory } from '../../testing/ScratchWorkspace.ts';
import { waitUntil }                                      from '../../testing/WaitUntil.ts';
import { type WatcherProtocolClient, connectToWatcher }   from '../../testing/WatcherProtocolClient.ts';
import { workspacePathsFor }                              from '../tracker/Workspace.ts';
import { REAL_PROCESS_STARTS }                            from './ProcessStarts.ts';
import { WatcherFleet }                                   from './WatcherFleet.ts';

const ports = nativePlatformPorts();
const { processSupervision } = ports;

const CHILD_LINE = fakeAssistantTurnLine('example-reply');
const GREEN_OUTPUT = 'green-output';
const RED_OUTPUT = 'expected 2, received 3';
const RED_EXIT_CODE = 4;
/** The child of a process line waits this long first, so the client attaches before the line ends. */
const PROCESS_LINE_PAUSE = 'sleep 1';
/** The fake agent, as the real `claude`, ends on a stdin line that is not JSON, so the frame carries a chat line. */
const EXAMPLE_LINE_FRAME: ActingFrame = { kind: 'write', line: fakeAgentAdapter().chatLineOf('Example line') };
const CLOSE_INPUT_FRAME: ActingFrame = { kind: 'close-input' };
const STOP_FRAME: ActingFrame = { kind: 'stop', graceMilliseconds: 0 };

let repository = '';
let monitorFolder = '';
let bundlePath = '';
let lastJobNumber = 0;
const clients: WatcherProtocolClient[] = [];

interface StagedWatcher {
  readonly watcherFolder: string;
  readonly client:        WatcherProtocolClient;
  readonly childLines:    readonly string[];
  readonly exitCode?:     number;
  welcomeActivity:        string;
  entriesSeen:            number;
  framesSeen:             number;
}

function nextFolder(name: string): string {
  lastJobNumber += 1;
  const folder = join(repository, 'jobs', `${name}-${lastJobNumber}`);
  mkdirSync(folder, { recursive: true });
  return folder;
}

function recordOf(watcherFolder: string): ReturnType<typeof WatcherFleet.watcherRecordOf> {
  return WatcherFleet.watcherRecordOf(watcherFolder, 1);
}

function entriesOf(watcherFolder: string): { origin: string; line: string }[] {
  const entries = WatcherFleet.eventsAfter(watcherFolder, 1, 0);
  return entries === 'malformed' ? [] : entries.map(({ origin, line }) => ({ origin, line }));
}

async function attached(watcherFolder: string, childLines: readonly string[], exitCode?: number): Promise<StagedWatcher> {
  await waitUntil(() => recordOf(watcherFolder)?.socketPath !== undefined, 'the Watcher naming its socket');
  const reading = readWatcherLaunch(watcherFilesOf(watcherFolder, 1).launchPath, ports.localEndpoint);
  if (reading.verdict !== 'read') throw new Error('the launch file is unreadable');
  const client = await connectToWatcher(reading.launch.socketPath);
  clients.push(client);
  client.send({
    kind: 'hello', protocolVersion: WATCHER_PROTOCOL_VERSION, sinceSequence: 0, watcherSecret: readWatcherSecret(reading.launch.secretFilePath) ?? ''
  });
  const welcome = await client.nextFrame((frame) => frame.kind === 'welcome');
  await client.nextFrame((frame) => frame.kind === 'history');
  return {
    watcherFolder,
    client,
    childLines,
    ...(exitCode === undefined ? {} : { exitCode }),
    welcomeActivity: welcome.kind === 'welcome' ? welcome.state : '',
    entriesSeen:     0,
    framesSeen:      client.received().length,
  };
}

function launchSession(steps: readonly FakeAgentStep[]): string {
  const jobFolder = nextFolder('session');
  WatcherFleet.writeLaunchFiles(ports, {
    jobFolder,
    instance:           1,
    jobId:              `session-${lastJobNumber}`,
    trackerId:          'example',
    monitorFolder,
    watcherCodeVersion: 'code-example',
    workingDirectory:   repository,
    plan:               fakeAgentAdapter(steps).planOf({ jobFilesDirectory: jobFolder, environment: {} } as never),
  });
  REAL_PROCESS_STARTS.spawnWatcher(ports, {
    bundlePath, jobFolder, instance: 1, rootDirectory: repository
  });
  return jobFolder;
}

function launchProcessLine(line: string): string {
  const watcherFolder = nextFolder('gate');
  WatcherFleet.writeProcessLaunchFile(ports, {
    watcherFolder,
    instance:           1,
    jobId:              `gate-${lastJobNumber}`,
    socketName:         `gate-${lastJobNumber}`,
    trackerId:          'example',
    monitorFolder,
    watcherCodeVersion: 'code-example',
    workingDirectory:   repository,
    argv:               ports.shellLine.spawnRequestOf(line, join(watcherFolder, 'line-status')).argv,
    environment:        { PATH: '/usr/bin:/bin' },
  });
  REAL_PROCESS_STARTS.spawnWatcher(ports, {
    bundlePath, jobFolder: watcherFolder, instance: 1, rootDirectory: repository
  });
  return watcherFolder;
}

function processRuns(processId: number | undefined): boolean {
  return processId !== undefined && !processSupervision.processIsGone(processId);
}

/** Everything the stage changed since the last one, recorded as the stage's answer, which the case then reads. */
function recordedStage(
  staged: StagedWatcher,
  stage: WatcherStage,
  sentFrames: readonly ActingFrame[],
  childTreeAfterTheStop?: WatcherStageAnswer['childTreeAfterTheStop'],
): WatcherStageAnswer {
  const record = recordOf(staged.watcherFolder);
  const entries = entriesOf(staged.watcherFolder).slice(staged.entriesSeen);
  const frames = staged.client.received().slice(staged.framesSeen)
    .filter((frame) => frame.kind === 'message' || frame.kind === 'state')
    .map((frame) => (frame.kind === 'message' ? { kind: 'message', entry: { origin: frame.entry.origin, line: frame.entry.line } } : frame));
  const lastState = [...frames].reverse().find((frame): frame is Extract<WatcherFrame, { kind: 'state' }> => frame.kind === 'state');
  staged.entriesSeen += entries.length;
  staged.framesSeen = staged.client.received().length;
  staged.welcomeActivity = lastState?.state ?? staged.welcomeActivity;
  const answer = {
    record,
    entries,
    frames,
    activity:    staged.welcomeActivity,
    watcherRuns: processRuns(record?.watcher?.processId),
    childRuns:   processRuns(record?.childProcess?.processId),
    ...(childTreeAfterTheStop === undefined ? {} : { childTreeAfterTheStop }),
  };
  const recorded = asRecordedWatcherStage(answer, {
    watcher:     record?.watcher ?? null,
    child:       record?.childProcess ?? null,
    ...(record?.childProcessGroupId === undefined ? {} : { childProcessId: record.childProcessGroupId }),
    ...(record?.socketPath === undefined ? {} : { socketPath: record.socketPath }),
    codeVersion: 'code-example',
    ...(staged.exitCode === undefined ? {} : { exitCode: staged.exitCode }),
    frameLines:  sentFrames.map((frame) => JSON.stringify(frame)),
    childLines:  staged.childLines,
  }) as WatcherStageAnswer;
  recordAnswer(watcherStageCallShapeOf(stage), recorded);
  return recorded;
}

async function sent(staged: StagedWatcher, frame: ActingFrame): Promise<void> {
  await waitUntil(async () => await WatcherFleet.sendFrames(ports, staged.watcherFolder, 1, [frame]), `the ${frame.kind} frame being taken`);
}

async function untilEnded(staged: StagedWatcher): Promise<void> {
  await waitUntil(() => WatcherFleet.livenessOf(ports, staged.watcherFolder, 1).verdict === 'ended', 'the child ending');
  await staged.client.nextFrame((frame) => frame.kind === 'state' && frame.state === 'ended');
}

async function untilWatcherGone(staged: StagedWatcher): Promise<void> {
  await waitUntil(() => !processRuns(recordOf(staged.watcherFolder)?.watcher?.processId), 'the Watcher exiting');
}

beforeEach(async () => {
  repository = createScratchDirectory('watcher-stages');
  monitorFolder = createScratchDirectory('h');
  bundlePath = await pinnedScratchWatcherBundle(workspacePathsFor(repository));
});

afterEach(() => {
  for (const client of clients.splice(0)) client.close();
  removeScratchDirectory(monitorFolder);
  removeScratchDirectory(repository);
});

describe('a session through its stages', () => {
  test('launched, it runs its child; a line is logged as the client\'s, the reply as the agent\'s; a closed input ends it; the acknowledgement lets it exit', async () => {
    const staged = await attached(launchSession([{ kind: 'await-line' }, { kind: 'print', line: CHILD_LINE }, { kind: 'await-line' }]), [CHILD_LINE], 0);
    await waitUntil(() => recordOf(staged.watcherFolder)?.state === 'running', 'the child running');
    const launch = recordedStage(staged, WATCHER_STAGES.LAUNCH_AND_CLAIM, []);
    expect(launch).toMatchObject({ record: { state: 'running', watcher: '<watcher>', childProcess: '<child>' }, watcherRuns: true, childRuns: true });

    await sent(staged, EXAMPLE_LINE_FRAME);
    await staged.client.nextFrame((frame) => frame.kind === 'message' && frame.entry.line === CHILD_LINE);
    expect(recordedStage(staged, WATCHER_STAGES.SESSION_LINE, [EXAMPLE_LINE_FRAME]).entries).toEqual([
      { origin: 'client', line: '<frame>' }, { origin: 'agent', line: '<child line>' },
    ]);

    await sent(staged, CLOSE_INPUT_FRAME);
    await untilEnded(staged);
    const inputClosed = recordedStage(staged, WATCHER_STAGES.SESSION_INPUT_CLOSED, [CLOSE_INPUT_FRAME]);
    expect(inputClosed)
      .toMatchObject({ record: { state: 'ended', end: { reason: 'exited', exitCode: '<exit code>', signal: null } }, watcherRuns: true, childRuns: false });

    expect(await WatcherFleet.reapEndedHostsIn(ports, staged.watcherFolder)).toBe(1);
    await untilWatcherGone(staged);
    // The mock keeps the record of the stage that ended the Watcher, since the Watcher never writes it again.
    expect(recordedStage(staged, WATCHER_STAGES.SESSION_ACKNOWLEDGED, [CLOSE_INPUT_FRAME])).toMatchObject({ record: inputClosed.record, entries: [], watcherRuns: false });
  }, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);

  test('a child that crashes ends signalled, and the Watcher lingers for its acknowledgement', async () => {
    const staged = await attached(launchSession([{ kind: 'await-line' }, { kind: 'crash' }]), []);
    await waitUntil(() => recordOf(staged.watcherFolder)?.state === 'running', 'the child running');
    staged.entriesSeen = entriesOf(staged.watcherFolder).length;
    await sent(staged, EXAMPLE_LINE_FRAME);
    await untilEnded(staged);
    expect(recordedStage(staged, WATCHER_STAGES.AGENT_CRASH, [EXAMPLE_LINE_FRAME]))
      .toMatchObject({ record: { state: 'ended', end: { reason: 'signalled', exitCode: null } }, watcherRuns: true, childRuns: false });
    await WatcherFleet.reapEndedHostsIn(ports, staged.watcherFolder);
    await untilWatcherGone(staged);
  }, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);

  test('a Watcher killed leaves its record running and no end, and its child sees its input close', async () => {
    const staged = await attached(launchSession([{ kind: 'await-line' }, { kind: 'await-line' }]), []);
    await waitUntil(() => recordOf(staged.watcherFolder)?.state === 'running', 'the child running');
    const before = recordOf(staged.watcherFolder);
    process.kill(before?.watcher?.processId ?? 0, 'SIGKILL');
    await untilWatcherGone(staged);
    await waitUntil(() => !processRuns(before?.childProcess?.processId), 'the child ending on its closed input');
    const crash = recordedStage(staged, WATCHER_STAGES.WATCHER_CRASH, []);
    expect(crash).toMatchObject({ record: { state: 'running' }, watcherRuns: false, childRuns: false });
    expect(WatcherFleet.livenessOf(ports, staged.watcherFolder, 1).verdict).toBe('lost');
  }, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);
});

describe('a process line through its stages', () => {
  test('a line that ends green logs its output as the agent\'s and ends at exit 0; the stop acknowledgement lets the Watcher exit', async () => {
    const staged = await attached(launchProcessLine(`${PROCESS_LINE_PAUSE}; echo ${GREEN_OUTPUT}`), [GREEN_OUTPUT], 0);
    await untilEnded(staged);
    expect(recordedStage(staged, WATCHER_STAGES.PROCESS_LINE_GREEN, []))
      .toMatchObject({ entries: [{ origin: 'agent', line: '<child line>' }], record: { end: { reason: 'exited', exitCode: '<exit code>' } }, watcherRuns: true });
    expect(await WatcherFleet.reapEndedHostsIn(ports, staged.watcherFolder)).toBe(1);
    await untilWatcherGone(staged);
    expect(recordedStage(staged, WATCHER_STAGES.PROCESS_ACKNOWLEDGED, [STOP_FRAME])).toMatchObject({ entries: [], watcherRuns: false });
  }, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);

  test('a line that ends red logs its output and ends at its exit code', async () => {
    const staged = await attached(launchProcessLine(`${PROCESS_LINE_PAUSE}; echo ${RED_OUTPUT}; exit ${RED_EXIT_CODE}`), [RED_OUTPUT], RED_EXIT_CODE);
    await untilEnded(staged);
    expect(recordedStage(staged, WATCHER_STAGES.PROCESS_LINE_RED, []))
      .toMatchObject({ entries: [{ origin: 'agent', line: '<child line>' }], record: { end: { reason: 'exited', exitCode: '<exit code>' } } });
    await WatcherFleet.reapEndedHostsIn(ports, staged.watcherFolder);
    await untilWatcherGone(staged);
  }, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);

  test('a stop by the Overseer is logged as the client\'s and ends the line signalled, the Watcher lingering for its acknowledgement', async () => {
    const staged = await attached(launchProcessLine('sleep 300'), []);
    await waitUntil(() => recordOf(staged.watcherFolder)?.state === 'running', 'the line running');
    const child = recordOf(staged.watcherFolder)?.childProcess ?? null;
    const treeBeforeTheStop = child === null ? [] : processSupervision.treeMembersOf(child) ?? [];
    await sent(staged, STOP_FRAME);
    await untilEnded(staged);
    const childTreeAfterTheStop = child === null ? null : processSupervision.treeMembersOf(child, treeBeforeTheStop);
    expect(recordedStage(staged, WATCHER_STAGES.STOP_BY_THE_OVERSEER, [STOP_FRAME], childTreeAfterTheStop))
      .toMatchObject({
        entries: [{ origin: 'client', line: '<frame>' }], record: { state: 'ended' }, watcherRuns: true, childRuns: false, childTreeAfterTheStop: []
      });
    await WatcherFleet.reapEndedHostsIn(ports, staged.watcherFolder);
    await untilWatcherGone(staged);
  }, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);
});
