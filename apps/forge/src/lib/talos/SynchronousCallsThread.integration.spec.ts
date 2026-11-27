/**
 * The synchronous-calls thread as a real Bun worker: a call that throws answers `failed` and the thread goes on, process-tree calls run off
 * the main thread so a short timer fires in time, a worker keeps the code it loaded at its start (why Talos starts it once), and a worker
 * that dies rejects every pending call, so Talos ends instead of waiting for ever.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join }                        from 'node:path';

import { afterAll, expect, test } from 'bun:test';

import { nativePlatformPorts }                            from '../../testing/NativePlatformPorts.ts';
import { recordAnswer }                                   from '../../testing/RecordedAnswers.ts';
import { createScratchDirectory, removeScratchDirectory } from '../../testing/ScratchWorkspace.ts';
import { OUTLIVES_EVERY_WAIT_SECONDS }                    from '../../testing/WaitUntil.ts';
import { eventLogEntriesOf, type EventLogEntry }          from './EventLog.ts';
import {
  createSynchronousCalls,
  type SynchronousCalls,
  SynchronousCallFailedError,
  startSynchronousCallsWorker,
  type SynchronousCallsWorker
} from './SynchronousCallsClient.ts';

const MAIN_THREAD_TIMER_MILLISECONDS = 50;
/** A main thread blocked by a process-table listing would miss this; a free one fires within a few milliseconds of its delay. */
const MAIN_THREAD_TIMER_LATENESS_ALLOWANCE_MILLISECONDS = 100;
/** About 30 milliseconds each, so the queue keeps the worker busy well past the timer and its allowance; on the main thread it would block both. */
const QUEUED_TREE_READINGS = 12;
const EXAMPLE_STAMP = '2026-11-18T00:00:00.000Z';
const PROCESS_PLACEHOLDER = '<process>';
const CALLER_PLACEHOLDER = '<caller>';

const SYNCHRONOUS_CALL_SHAPES = {
  IDENTITY_OF_THE_CALLER:            'identity-of <caller>',
  TREE_OF_A_SLEEPING_LEADER:         'tree-members-of <identity>, a sleeping process born as the leader of its own group',
  ASKED_STOP_OF_A_SLEEPING_LEADER:   'stop-tree <identity> ask <its tree members>, a sleeping process born as the leader of its own group',
  APPEND_TO_A_LOG_NOT_OPEN:          'append-event, no event log open at the path',
  EXCLUSIVE_WRITE_OF_AN_ABSENT_FILE: 'write-record exclusive, the file absent',
  EXCLUSIVE_WRITE_OF_A_PRESENT_FILE: 'write-record exclusive, the file present',
  REPLACING_WRITE_OF_A_PRESENT_FILE: 'write-record not exclusive, the file present',
} as const;

const workers: SynchronousCallsWorker[] = [];
const scratchFolders: string[] = [];

afterAll(() => {
  for (const worker of workers) worker.terminate();
  for (const folder of scratchFolders) removeScratchDirectory(folder);
});

function scratchFolder(prefix: string): string {
  const folder = createScratchDirectory(prefix);
  scratchFolders.push(folder);
  return folder;
}

async function startedCalls(): Promise<SynchronousCalls> {
  const worker = startSynchronousCallsWorker();
  workers.push(worker);
  const calls = createSynchronousCalls(worker);
  await calls.start(process.platform, null);
  return calls;
}

const PROCESS_ID_KEYS = ['processId', 'processGroupId', 'parentProcessId'];

/** Every process id the answer names, as the placeholder of the process it is, so a replay fills in its own. */
function withProcessIdsReplaced(value: unknown, sleepingProcessId: number | null): unknown {
  return JSON.parse(JSON.stringify(value, (key: string, field: unknown) => {
    if (!PROCESS_ID_KEYS.includes(key)) return field;
    if (field === sleepingProcessId) return PROCESS_PLACEHOLDER;
    return field === process.pid ? CALLER_PLACEHOLDER : field;
  }));
}

async function failureReasonOf(call: Promise<unknown>): Promise<string> {
  const failure: unknown = await call.catch((error: unknown) => error);
  if (!(failure instanceof SynchronousCallFailedError)) throw new Error('the call did not answer failed');
  return failure.reason;
}

test('the worker reads this process\'s identity through the real process table', async () => {
  const calls = await startedCalls();
  const identity = await calls.identityOf(process.pid);
  expect(identity).toEqual(nativePlatformPorts().processSupervision.identityOf(process.pid));
  expect(identity?.processId).toBe(process.pid);
  recordAnswer(SYNCHRONOUS_CALL_SHAPES.IDENTITY_OF_THE_CALLER, withProcessIdsReplaced(identity, null));
});

test('three appended event-log entries read back whole after sync-and-close-event-log', async () => {
  const calls = await startedCalls();
  const eventLogPath = join(scratchFolder('synchronous-calls-log'), 'jobs', 'J-1', 'events-1.ndjson');
  const entries: EventLogEntry[] = [
    {
      sequence: 1, origin: 'agent', line: '{"type":"system"}', at: EXAMPLE_STAMP
    },
    {
      sequence: 2, origin: 'client', line: '{"act":"close"}', at: EXAMPLE_STAMP
    },
    {
      sequence: 3, origin: 'agent', line: '{"type":"result"}', at: EXAMPLE_STAMP
    },
  ];
  await calls.openEventLog(eventLogPath);
  const appendedEntries = await Promise.all(entries.map((entry) => calls.appendEvent(eventLogPath, entry)));
  await calls.syncAndCloseEventLog(eventLogPath);
  expect(appendedEntries).toEqual(entries);
  expect(eventLogEntriesOf(readFileSync(eventLogPath, 'utf8'))).toEqual({ verdict: 'read', entries });
});

test('a call that throws answers failed, and the thread goes on answering', async () => {
  const calls = await startedCalls();
  const folder = scratchFolder('synchronous-calls-failure');
  const notOpenedPath = join(folder, 'events-1.ndjson');
  const reason = await failureReasonOf(calls.appendEvent(notOpenedPath, {
    sequence: 1, origin: 'agent', line: '{}', at: EXAMPLE_STAMP
  }));
  expect(reason).toBe(`no event log is open at ${notOpenedPath}`);
  recordAnswer(SYNCHRONOUS_CALL_SHAPES.APPEND_TO_A_LOG_NOT_OPEN, { verdict: 'failed', reason: 'no event log is open at <path>' });

  await calls.openEventLog(notOpenedPath);
  expect(await failureReasonOf(calls.appendEvent(notOpenedPath, {
    sequence: 2, origin: 'agent', line: '{}', at: EXAMPLE_STAMP
  })))
    .toBe(`the event log at ${notOpenedPath} appends sequence 1 next, not 2`);
  expect(await failureReasonOf(calls.appendEvent(notOpenedPath, { sequence: 1, origin: 'agent', line: '{}' })))
    .toBe('the event-log entry of sequence 1 carries no stamp');
  await calls.syncAndCloseEventLog(notOpenedPath);

  const recordPath = join(folder, 'child-1.json');
  const created = await calls.writeRecord(recordPath, '{"state":"starting"}\n', true);
  const refused = await calls.writeRecord(recordPath, '{"state":"claimed twice"}\n', true);
  const replaced = await calls.writeRecord(recordPath, '{"state":"running"}\n', false);
  expect([created, refused, replaced]).toEqual(['created', 'already-exists', 'replaced']);
  expect(readFileSync(recordPath, 'utf8')).toBe('{"state":"running"}\n');
  recordAnswer(SYNCHRONOUS_CALL_SHAPES.EXCLUSIVE_WRITE_OF_AN_ABSENT_FILE, created);
  recordAnswer(SYNCHRONOUS_CALL_SHAPES.EXCLUSIVE_WRITE_OF_A_PRESENT_FILE, refused);
  recordAnswer(SYNCHRONOUS_CALL_SHAPES.REPLACING_WRITE_OF_A_PRESENT_FILE, replaced);

  await calls.appendText(join(folder, 'talos', 'talos-1.log'), 'first line\n');
  await calls.appendText(join(folder, 'talos', 'talos-1.log'), 'second line\n');
  expect(readFileSync(join(folder, 'talos', 'talos-1.log'), 'utf8')).toBe('first line\nsecond line\n');
});

test('while the worker works through a queue of process-tree calls longer than a 50 millisecond main-thread timer, the timer fires within its bound', async () => {
  const calls = await startedCalls();
  const sleeper = Bun.spawn(['sleep', String(OUTLIVES_EVERY_WAIT_SECONDS)], {
    detached: true, stdin: 'ignore', stdout: 'ignore', stderr: 'ignore'
  });
  try {
    const leader = await calls.identityOf(sleeper.pid);
    if (leader === null) throw new Error(`the sleeping process ${sleeper.pid} has no readable identity`);

    const queueStartedAt = performance.now();
    const timerFiring = new Promise<number>((resolve) => {
      setTimeout(() => resolve(performance.now()), MAIN_THREAD_TIMER_MILLISECONDS);
    });
    const queuedTreeReadings = Array.from({ length: QUEUED_TREE_READINGS }, () => calls.treeMembersOf(leader, []));
    const treeMembers = (await Promise.all(queuedTreeReadings))[0];
    if (treeMembers === undefined || treeMembers === null) throw new Error('the sleeping tree could not be read');
    const stopOutcome = await calls.stopTree(leader, 'ask', treeMembers);
    const lastAnswerAt = performance.now();

    expect(lastAnswerAt - queueStartedAt).toBeGreaterThan(MAIN_THREAD_TIMER_MILLISECONDS + MAIN_THREAD_TIMER_LATENESS_ALLOWANCE_MILLISECONDS);
    const timerFiredAt = await timerFiring;
    expect(timerFiredAt - queueStartedAt - MAIN_THREAD_TIMER_MILLISECONDS).toBeLessThan(MAIN_THREAD_TIMER_LATENESS_ALLOWANCE_MILLISECONDS);
    expect(timerFiredAt).toBeLessThan(lastAnswerAt);
    expect(stopOutcome).toEqual({ verdict: 'signalled' });
    expect(await sleeper.exited).not.toBe(0);
    recordAnswer(SYNCHRONOUS_CALL_SHAPES.TREE_OF_A_SLEEPING_LEADER, withProcessIdsReplaced(treeMembers, sleeper.pid));
    recordAnswer(SYNCHRONOUS_CALL_SHAPES.ASKED_STOP_OF_A_SLEEPING_LEADER, stopOutcome);
  } finally {
    sleeper.kill('SIGKILL');
  }
});

test('the worker prepares an endpoint in a folder it creates and releases it', async () => {
  const calls = await startedCalls();
  const monitorFolder = scratchFolder('h');
  const endpoint = nativePlatformPorts().localEndpoint.endpointOf({
    monitorFolder, trackerId: 'tracker-example', name: 'talos', instance: 1
  });
  expect(await calls.prepareEndpoint(endpoint)).toEqual({ verdict: 'done' });
  expect(await calls.releaseEndpoint(endpoint)).toEqual({ verdict: 'done' });
});

test('a terminated worker rejects the calls it left pending and every later call', async () => {
  const calls = await startedCalls();
  const worker = workers.at(-1);
  if (worker === undefined) throw new Error('no worker was started');
  const queuedReadings = Array.from({ length: QUEUED_TREE_READINGS }, () => calls.identityOf(process.pid));
  worker.terminate();
  const reasons = await Promise.all([...queuedReadings, calls.identityOf(process.pid)].map(failureReasonOf));
  expect(new Set(reasons)).toEqual(new Set(['the synchronous-calls thread was terminated']));
});

test.each([
  ['throws uncaught', 'throw new Error(\'the planted thread failed\');', 'the synchronous-calls thread failed: '],
  ['exits', 'process.exit(1);', 'the synchronous-calls thread closed'],
])('a worker whose thread %s rejects the call it left pending and every later call', async (_title, dyingStatement, reasonStart) => {
  const folder = scratchFolder('dying-thread');
  const threadEntryPath = join(folder, 'DyingThread.ts');
  writeFileSync(threadEntryPath, `addEventListener('message', () => {\n  ${dyingStatement}\n});\n`);
  const worker = startSynchronousCallsWorker(Bun.pathToFileURL(threadEntryPath));
  workers.push(worker);
  const calls = createSynchronousCalls(worker);
  const pendingReason = await failureReasonOf(calls.identityOf(process.pid));
  expect(pendingReason.startsWith(reasonStart)).toBe(true);
  expect(await failureReasonOf(calls.identityOf(process.pid))).toBe(pendingReason);
});

test('a started worker keeps the code it loaded when its modules change on disk, and only a worker started again reads the change', async () => {
  const folder = scratchFolder('synchronous-calls-load');
  const answerModulePath = join(folder, 'LoadedAnswer.ts');
  const threadModulePath = join(folder, 'AnsweringThread.ts');
  writeFileSync(answerModulePath, 'export const LOADED_ANSWER = \'loaded at start\';\n');
  writeFileSync(threadModulePath, 'import { LOADED_ANSWER } from \'./LoadedAnswer.ts\';\naddEventListener(\'message\', () => { postMessage(LOADED_ANSWER); });\n');

  const answerOfWorker = (worker: Worker): Promise<unknown> => new Promise((resolve) => {
    worker.addEventListener('message', (event: MessageEvent) => resolve(event.data), { once: true });
    worker.postMessage('ask');
  });
  const startedWorker = new Worker(threadModulePath);
  try {
    expect(await answerOfWorker(startedWorker)).toBe('loaded at start');
    writeFileSync(answerModulePath, 'export const LOADED_ANSWER = \'changed on disk\';\n');
    expect(await answerOfWorker(startedWorker)).toBe('loaded at start');
  } finally {
    startedWorker.terminate();
  }
  const workerStartedAfterTheChange = new Worker(threadModulePath);
  try {
    expect(await answerOfWorker(workerStartedAfterTheChange)).toBe('changed on disk');
  } finally {
    workerStartedAfterTheChange.terminate();
  }
});
