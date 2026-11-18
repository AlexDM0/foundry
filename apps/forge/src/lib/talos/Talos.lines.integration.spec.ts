/**
 * Line children end to end with the Talos binary and small `bun -e` children. What matters: a line's stdout lines are numbered in its event
 * log and its stderr is in its log; its record names Talos and the child and how it ended; a stop reaches a group below the child; a line
 * past its time bound ends `time-bound`, while a Talos suspended longer than the bound adds the suspension to the allowance and leaves it out
 * of the run time; `stop-lines` ends every line; a launch outside the board is refused and a launch of a known child spawns nothing; and a
 * failed synchronous call, or a synchronous-calls thread that dies, ends Talos with exit 2 and its cause in its log. The dead thread is
 * planted in a Talos run in this process, over a thread entry that loads the real one and exits once it answered `open-event-log`.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join }                                    from 'node:path';

import {
  afterEach,
  beforeEach,
  expect,
  test
} from 'bun:test';

import { CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS }                  from '../../testing/ChildProcessCaseTimeout.ts';
import { nativePlatformPorts }                                      from '../../testing/NativePlatformPorts.ts';
import { SPAWN_DETACHED_SLEEPER_LINES }                             from '../../testing/ProcessDoubles.ts';
import { createScratchTalos, type ScratchTalos, type SpawnedTalos } from '../../testing/ScratchTalos.ts';
import { createScratchDirectory, removeScratchDirectory }           from '../../testing/ScratchWorkspace.ts';
import type { TalosProtocolClient }                                 from '../../testing/TalosProtocolClient.ts';
import { testWhenProcessesCanBeSuspended }                          from '../../testing/ToolGuard.ts';
import { firstValueOf, waitUntil }                                  from '../../testing/WaitUntil.ts';
import { processIsGone }                                            from '../process-identity/ProcessIdentity.ts';
import type { DoneFrame, TalosFrame }                               from './@types/TalosFrame.ts';
import type { ChildLaunch }                                         from './ChildLaunch.ts';
import { startSynchronousCallsWorker }                              from './SynchronousCallsClient.ts';
import { runTalosOnPorts }                                          from './Talos.ts';
import { childFilesOf, launchRegistryPathOf }                       from './TalosFiles.ts';

const START_NUMBER = 1;
const STAYS_UNTIL_STOPPED = 'setInterval(() => undefined, 60000);';
const TIME_BOUND_MILLISECONDS = 300;
const SUSPENDED_LINE_BOUND_MILLISECONDS = 600;
/** Longer than the bound: the line runs on while Talos is suspended, and marks its end before Talos continues. */
const SLEEPS_PAST_THE_BOUND = 'await Bun.sleep(1200);';
const STOP_GRACE_MILLISECONDS = 300;

let currentScratchTalos: ScratchTalos | null = null;

beforeEach(() => {
  currentScratchTalos = createScratchTalos();
});

afterEach(async () => {
  await currentScratchTalos?.remove();
});

function scratchTalos(): ScratchTalos {
  if (currentScratchTalos === null) throw new Error('no scratch Talos outside a test');
  return currentScratchTalos;
}

interface ServingTalos {
  readonly talos:  SpawnedTalos;
  readonly client: TalosProtocolClient;
  /** Sends the frame with the next frame id and answers its `done`. */
  readonly send:   (frame: object) => Promise<DoneFrame>;
  /** Quits Talos cleanly and answers its exit code. */
  readonly quit:   () => Promise<number>;
}

async function servingTalos(bounds: { tickMilliseconds?: number } = {}): Promise<ServingTalos> {
  const scratch = scratchTalos();
  scratch.writeStartFile(START_NUMBER, bounds);
  const talos = scratch.spawnTalos(START_NUMBER);
  const client = await scratch.attach(START_NUMBER);
  let lastFrameId = 0;
  const send = async (frame: object): Promise<DoneFrame> => {
    lastFrameId += 1;
    const frameId = lastFrameId;
    client.send({ ...frame, frameId });
    return await client.nextFrame((received: TalosFrame) => received.kind === 'done' && received.frameId === frameId) as DoneFrame;
  };
  return {
    talos,
    client,
    send,
    quit: async () => {
      await send({ kind: 'quit', reason: 'restart' });
      return scratch.exitCodeOf(talos, START_NUMBER);
    },
  };
}

function launchFrameOf(launch: ChildLaunch): object {
  return { kind: 'launch', launch };
}

test('a line\'s stdout lines are numbered in its event log, its stderr is in its log, and its record names both processes and its end', async () => {
  const scratch = scratchTalos();
  const serving = await servingTalos();
  const launch = scratch.lineLaunch('jobs/J-1/install', 1, 'console.log("first"); console.log("second"); console.error("to stderr"); process.exit(3);');
  expect(await serving.send(launchFrameOf(launch))).toMatchObject({ verdict: 'done' });

  const record = await scratch.endedRecordOf('jobs/J-1/install', 1);
  expect(scratch.eventsOf('jobs/J-1/install', 1).map(({ sequence, origin, line }) => ({ sequence, origin, line }))).toEqual([
    { sequence: 1, origin: 'agent', line: 'first' },
    { sequence: 2, origin: 'agent', line: 'second' },
  ]);
  expect(readFileSync(childFilesOf(scratch.boardFolder, 'jobs/J-1/install', 1).standardErrorPath, 'utf8')).toBe('to stderr\n');
  expect(record).toMatchObject({
    childId: 'jobs/J-1/install#1', kind: 'line', state: 'ended', talosStartNumber: START_NUMBER, workingDirectory: scratch.boardFolder,
  });
  expect(record.talos?.processId).toBe(serving.talos.pid);
  expect(record.childProcess?.processId).toBe(record.childProcessGroupId ?? 0);
  expect(record.end).toMatchObject({
    reason: 'exited', exitCode: 3, signal: null, detail: null
  });
  expect(await serving.client.nextFrame((frame) => frame.kind === 'state' && frame.state === 'ended')).toMatchObject({ childId: 'jobs/J-1/install#1' });
  expect(await serving.quit()).toBe(0);
}, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);

test('a stop reaches a command leading a group of its own below the line', async () => {
  const scratch = scratchTalos();
  const serving = await servingTalos();
  await serving.send(launchFrameOf(scratch.lineLaunch('jobs/J-1/gate-1', 1, `${SPAWN_DETACHED_SLEEPER_LINES} ${STAYS_UNTIL_STOPPED}`)));
  const commandProcessId = await firstValueOf(() => {
    const [firstEntry] = scratch.eventsOf('jobs/J-1/gate-1', 1);
    return firstEntry === undefined ? undefined : Number(firstEntry.line);
  }, 'the line printing its command\'s process id');
  try {
    expect(processIsGone(commandProcessId)).toBe(false);
    expect(await serving.send({ kind: 'stop', childId: 'jobs/J-1/gate-1#1', graceMilliseconds: STOP_GRACE_MILLISECONDS })).toMatchObject({ verdict: 'done' });
    expect((await scratch.endedRecordOf('jobs/J-1/gate-1', 1)).end?.reason).toBe('signalled');
    await waitUntil(() => processIsGone(commandProcessId), () => `the command going; the Talos log: ${scratch.talosLogOf(START_NUMBER)}`);
    expect(await serving.send({ kind: 'stop', childId: 'jobs/J-1/gate-1#1', graceMilliseconds: 0 })).toMatchObject({ verdict: 'already-done' });
  } finally {
    if (!processIsGone(commandProcessId)) process.kill(commandProcessId, 'SIGKILL');
  }
  expect(await serving.quit()).toBe(0);
}, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);

test('a line past its time bound ends time-bound, whatever its exit, with a run time of at least the bound', async () => {
  const scratch = scratchTalos();
  const serving = await servingTalos();
  await serving.send(launchFrameOf(scratch.lineLaunch('jobs/J-1/gate-1', 1, STAYS_UNTIL_STOPPED, { timeBoundMilliseconds: TIME_BOUND_MILLISECONDS })));
  const { end, timeBoundMilliseconds } = await scratch.endedRecordOf('jobs/J-1/gate-1', 1);
  expect(timeBoundMilliseconds).toBe(TIME_BOUND_MILLISECONDS);
  expect(end?.reason).toBe('time-bound');
  expect(end?.runMilliseconds).toBeGreaterThanOrEqual(TIME_BOUND_MILLISECONDS);
  expect(await serving.quit()).toBe(0);
}, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);

testWhenProcessesCanBeSuspended('a Talos suspended longer than a line\'s bound adds the suspension to the allowance and leaves it out of the run time', async () => {
  const scratch = scratchTalos();
  const serving = await servingTalos();
  // A child of a suspended Talos stays unreaped, so the line marks its end in a file rather than by its process going.
  const endMarkerPath = join(scratch.boardFolder, 'line-ending');
  const markEnd = `require('node:fs').writeFileSync(${JSON.stringify(endMarkerPath)}, '');`;
  const launch = scratch.lineLaunch('jobs/J-1/gate-1', 1, `${SLEEPS_PAST_THE_BOUND} ${markEnd}`, { timeBoundMilliseconds: SUSPENDED_LINE_BOUND_MILLISECONDS });
  await serving.send(launchFrameOf(launch));
  await waitUntil(() => scratch.childRecordOf('jobs/J-1/gate-1', 1)?.state === 'running', 'the line running');
  process.kill(serving.talos.pid, 'SIGSTOP');
  try {
    await waitUntil(() => existsSync(endMarkerPath), 'the line ending while Talos is suspended');
  } finally {
    process.kill(serving.talos.pid, 'SIGCONT');
  }
  const { end } = await scratch.endedRecordOf('jobs/J-1/gate-1', 1);
  expect(end).toMatchObject({ reason: 'exited', exitCode: 0 });
  expect(end?.runMilliseconds).toBeLessThan(SUSPENDED_LINE_BOUND_MILLISECONDS);
  expect(await serving.quit()).toBe(0);
}, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);

test('stop-lines ends every line', async () => {
  const scratch = scratchTalos();
  const serving = await servingTalos();
  await serving.send(launchFrameOf(scratch.lineLaunch('jobs/J-1/gate-1', 1, STAYS_UNTIL_STOPPED)));
  await serving.send(launchFrameOf(scratch.lineLaunch('jobs/J-2/install', 1, STAYS_UNTIL_STOPPED)));
  expect(await serving.send({ kind: 'stop-lines' })).toMatchObject({ verdict: 'done' });
  expect((await scratch.endedRecordOf('jobs/J-1/gate-1', 1)).end?.reason).toBe('signalled');
  expect((await scratch.endedRecordOf('jobs/J-2/install', 1)).end?.reason).toBe('signalled');
  expect(await serving.quit()).toBe(0);
}, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);

test('a clean quit stops a running line, which ends paused', async () => {
  const scratch = scratchTalos();
  const serving = await servingTalos();
  await serving.send(launchFrameOf(scratch.lineLaunch('jobs/J-1/gate-1', 1, STAYS_UNTIL_STOPPED)));
  expect(await serving.quit()).toBe(0);
  expect(scratch.childRecordOf('jobs/J-1/gate-1', 1)?.end?.reason).toBe('paused');
}, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);

test('a launch outside the board folder is refused and spawns nothing', async () => {
  const scratch = scratchTalos();
  const serving = await servingTalos();
  expect(await serving.send(launchFrameOf(scratch.lineLaunch('../outside', 1, 'console.log("ran");')))).toEqual({
    kind: 'done', frameId: 1, verdict: 'refused', reason: 'folder-outside-board'
  });
  const launchWithNoArguments = { ...scratch.lineLaunch('jobs/J-1/gate-1', 1, 'console.log("ran");'), argv: [] };
  expect(await serving.send(launchFrameOf(launchWithNoArguments))).toMatchObject({ verdict: 'refused', reason: 'malformed-launch' });
  expect(scratch.childRecordOf('jobs/J-1/gate-1', 1)).toBeNull();
  expect(await serving.quit()).toBe(0);
}, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);

test('the same childId launched twice spawns once', async () => {
  const scratch = scratchTalos();
  const serving = await servingTalos();
  const launch = scratch.lineLaunch('jobs/J-1/gate-1', 1, 'console.log("ran");');
  const [first, second] = await Promise.all([serving.send(launchFrameOf(launch)), serving.send(launchFrameOf(launch))]);
  expect([first.verdict, second.verdict]).toEqual(['done', 'already-done']);
  await scratch.endedRecordOf('jobs/J-1/gate-1', 1);
  expect(scratch.eventsOf('jobs/J-1/gate-1', 1).map(({ line }) => line)).toEqual(['ran']);
  expect(readFileSync(launchRegistryPathOf(scratch.boardFolder, START_NUMBER), 'utf8')).toBe(`${JSON.stringify({
    childId: 'jobs/J-1/gate-1#1', childFolder: 'jobs/J-1/gate-1', instance: 1, kind: 'line'
  })}\n`);
  expect(await serving.quit()).toBe(0);
}, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);

test('a failed synchronous call ends Talos with exit 2 and its cause in its log, the records left as they are', async () => {
  const scratch = scratchTalos();
  const serving = await servingTalos();
  writeFileSync(join(scratch.boardFolder, 'blocker'), 'a file where a child folder would go\n');
  serving.client.send({ kind: 'launch', frameId: 1, launch: scratch.lineLaunch('blocker/gate-1', 1, 'console.log("ran");') });
  expect(await scratch.exitCodeOf(serving.talos, START_NUMBER)).toBe(2);
  expect(scratch.talosLogOf(START_NUMBER)).toContain('talos failed: ');
  expect(scratch.talosRecordOf(START_NUMBER)?.state).toBe('serving');
}, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);

test('a synchronous-calls thread that dies ends Talos with exit 2 and its cause in its log, the records left as they are', async () => {
  const scratch = scratchTalos();
  scratch.writeStartFile(START_NUMBER);
  const threadFolder = createScratchDirectory('dying-thread');
  try {
    const threadEntryPath = join(threadFolder, 'ThreadDyingAfterOpeningALog.ts');
    writeFileSync(threadEntryPath, [
      `import ${JSON.stringify(new URL('./SynchronousCallsThread.ts', import.meta.url).pathname)};`,
      'addEventListener(\'message\', (event) => {',
      '  if (event.data.call === \'open-event-log\') process.exit(1);',
      '});',
      '',
    ].join('\n'));
    const clock = { stampNow: () => new Date().toISOString(), wallNowMilliseconds: () => Date.now() };
    const exitCode = runTalosOnPorts([scratch.boardFolder, String(START_NUMBER)], clock, {
      endpoint:                    nativePlatformPorts().localEndpoint,
      startSynchronousCallsWorker: () => startSynchronousCallsWorker(Bun.pathToFileURL(threadEntryPath)),
      platformOfTheThread:         process.platform,
      systemRoot:                  null,
      spawnChild:                  () => {
        throw new Error('the thread dies before a child would run');
      },
      ownVariableOf: () => undefined,
    });
    const client = await scratch.attach(START_NUMBER);
    client.send({ kind: 'launch', frameId: 1, launch: scratch.lineLaunch('jobs/J-1/gate-1', 1, 'console.log("ran");') });
    expect(await exitCode).toBe(2);
    expect(scratch.talosLogOf(START_NUMBER)).toContain('talos failed: the synchronous call ');
    expect(scratch.talosLogOf(START_NUMBER)).toContain('the synchronous-calls thread closed');
    expect(scratch.talosRecordOf(START_NUMBER)?.state).toBe('serving');
    expect(scratch.childRecordOf('jobs/J-1/gate-1', 1)?.state).toBe('starting');
  } finally {
    removeScratchDirectory(threadFolder);
  }
}, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);
