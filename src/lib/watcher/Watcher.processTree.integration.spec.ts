/**
 * A stop reaches the whole tree, end to end with the Watcher binary: what matters is probe P7's shape, a command leading a group of its own
 * below the child, which a signal to the child's group misses, and above all a child that dies when stdin closes, because the walk through
 * parent ids finds nothing after that, so the listing must come first. The child's first stdout line is the command's process id.
 */
import {
  afterEach,
  beforeEach,
  expect,
  test
} from 'bun:test';

import { CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS } from '../../testing/ChildProcessCaseTimeout.ts';
import { SPAWN_DETACHED_SLEEPER_LINES }            from '../../testing/ProcessDoubles.ts';
import { waitUntil }                               from '../../testing/WaitUntil.ts';
import { type WatcherJob, createWatcherJob }       from '../../testing/WatcherJob.ts';
import { processIsGone }                           from '../process-identity/ProcessIdentity.ts';
import type { ActingFrame }                        from './@types/WatcherFrame.ts';

const STOP_GRACE_MILLISECONDS = 300;
const STOP_FRAME: ActingFrame = { kind: 'stop', graceMilliseconds: STOP_GRACE_MILLISECONDS };

const STAYS_AFTER_STDIN_CLOSES = `${SPAWN_DETACHED_SLEEPER_LINES} setInterval(() => undefined, 60000);`;
const EXITS_AT_STDIN_CLOSE     = `${SPAWN_DETACHED_SLEEPER_LINES} for await (const chunk of Bun.stdin.stream()) void chunk; process.exit(0);`;

let currentWatcherJob: WatcherJob | null = null;
let plantedProcessIds: number[] = [];

beforeEach(() => {
  currentWatcherJob = createWatcherJob();
  plantedProcessIds = [];
});

afterEach(() => {
  for (const processId of plantedProcessIds) if (!processIsGone(processId)) process.kill(processId, 'SIGKILL');
  currentWatcherJob?.remove();
});

function watcherJob(): WatcherJob {
  if (currentWatcherJob === null) throw new Error('no Watcher job outside a test');
  return currentWatcherJob;
}

/** Runs the child, sends the frames once it printed its command's process id, and answers that id once the Watcher exited. */
async function commandAfterStopping(childScript: string, frames: readonly ActingFrame[], framesAfterTheEnd: readonly ActingFrame[] = []): Promise<number> {
  const job = watcherJob();
  job.writeLaunch(1, 'agent', childScript);
  const watcher = job.spawnWatcher(1);
  const client  = await job.attach(1);
  const message = await client.nextFrame((frame) => frame.kind === 'message');
  const commandProcessId = message.kind === 'message' ? Number(message.entry.line) : 0;
  plantedProcessIds.push(commandProcessId);
  expect(processIsGone(commandProcessId)).toBe(false);
  for (const frame of frames) client.send(frame);
  await client.nextFrame((frame) => frame.kind === 'state' && frame.state === 'ended');
  for (const frame of framesAfterTheEnd) client.send(frame);
  client.send({ kind: 'close-input' });
  expect(await watcher.exited).toBe(0);
  client.close();
  return commandProcessId;
}

async function untilCommandGone(commandProcessId: number): Promise<void> {
  await waitUntil(() => processIsGone(commandProcessId), 'the command going');
}

test('a stop ends a command leading a group of its own below a child that stayed for the signals', async () => {
  await untilCommandGone(await commandAfterStopping(STAYS_AFTER_STDIN_CLOSES, [STOP_FRAME]));
}, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);

test('the tree is listed before stdin closes: a child dying at the close still leaves its command reachable', async () => {
  await untilCommandGone(await commandAfterStopping(EXITS_AT_STDIN_CLOSE, [STOP_FRAME]));
}, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);

test('a `close-input` ahead of the stop lists the tree too, so the stop after it finds the command', async () => {
  await untilCommandGone(await commandAfterStopping(EXITS_AT_STDIN_CLOSE, [{ kind: 'close-input' }, STOP_FRAME]));
}, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);

test('a stop that reaches the Watcher after the child ended at `close-input` still ends the command', async () => {
  await untilCommandGone(await commandAfterStopping(EXITS_AT_STDIN_CLOSE, [{ kind: 'close-input' }], [STOP_FRAME]));
}, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);
