/**
 * The store's lock passes only from a holder whose process is gone, across real processes: a holder in a child process takes the lock
 * through the local adapter and stops inside its hold, after its hold journal and first file. Killed there, its lock goes to the next
 * apply at its first attempt, which finishes the journaled write before its own; alive there, it keeps the lock however old its record,
 * and the apply is refused `tracker-lock-held` once its retries run out.
 */
import { existsSync, mkdirSync }  from 'node:fs';
import { join }                   from 'node:path';
import { afterAll, expect, test } from 'bun:test';

import { refusalIsOperationRefusal }                      from '../../shared/OperationRefusal.ts';
import { LIMITS }                                         from '../../shared/constants/Limits.ts';
import { CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS }        from '../../testing/ChildProcessCaseTimeout.ts';
import { ECHOED_CONTROL_CONTEXT }                         from '../../testing/EchoedControlContext.ts';
import { lockRetryWaitsDuring }                           from '../../testing/LockRetryWaits.ts';
import { nativePlatformPorts }                            from '../../testing/NativePlatformPorts.ts';
import { createScratchDirectory, removeScratchDirectory } from '../../testing/ScratchWorkspace.ts';
import { localStoreLayoutOf }                             from '../tracker/LocalStoreLayout.ts';
import { lockTakerOf }                                    from '../tracker/LockHolders.ts';
import { workspacePathsFor, type Workspace }              from '../tracker/Workspace.ts';
import { createLocalFilesBoardStore }                     from './LocalFilesBoardStore.ts';

const PLATFORM_TAKER = lockTakerOf(nativePlatformPorts().processSupervision, () => {});

const AN_HOUR_MILLISECONDS = 3_600_000;

const STARTED_AT = '2026-11-20T09:00:00+01:00';
const CHANGED_AT = '2026-11-20T10:00:00+01:00';

const INSIDE_THE_HOLD_LINE = 'inside-the-hold';

const scratchDirectories: string[] = [];

afterAll(() => {
  for (const directory of scratchDirectories) removeScratchDirectory(directory);
});

function scratchWorkspace(prefix: string): Workspace {
  const rootDirectory = createScratchDirectory(prefix);
  scratchDirectories.push(rootDirectory);
  // A planted `.git` folder: finding the tracker's place runs no git.
  mkdirSync(join(rootDirectory, '.git'), { recursive: true });
  return workspacePathsFor(rootDirectory);
}

const anHourAhead = (): Date => new Date(Date.now() + AN_HOUR_MILLISECONDS);

async function refusalAfterTheWholeRetryBudget(action: () => Promise<unknown>): Promise<unknown> {
  const { outcome, sleepMilliseconds } = await lockRetryWaitsDuring(action);
  expect(sleepMilliseconds, 'it waited out the whole retry budget before refusing').toEqual(
    Array.from({ length: LIMITS.LOCK_RETRY_COUNT }, () => LIMITS.LOCK_RETRY_INTERVAL_MILLISECONDS),
  );
  return outcome.settled === 'rejected' ? outcome.reason : null;
}

function refusalOf(caught: unknown): unknown {
  return refusalIsOperationRefusal(caught) ? { status: caught.status, detail: caught.detail } : caught;
}

/** A holder in a child process: it takes the store's lock through the local adapter and blocks inside the hold after its first file. */
function holderInsideItsHoldSource(workspace: Workspace): string {
  const module = (path: string): string => JSON.stringify(join(import.meta.dir, path));
  return `
    const { createLocalFilesBoardStore } = await import(${module('./LocalFilesBoardStore.ts')});
    const { lockTakerOf } = await import(${module('../tracker/LockHolders.ts')});
    const { nativePlatformPorts } = await import(${module('../../testing/NativePlatformPorts.ts')});
    const { ECHOED_CONTROL_CONTEXT } = await import(${module('../../testing/EchoedControlContext.ts')});
    const store = createLocalFilesBoardStore({
      workspace: ${JSON.stringify(workspace)},
      now: () => new Date(),
      lockTaker: lockTakerOf(nativePlatformPorts().processSupervision, () => {}),
      afterFileWritten: () => {
        console.log(${JSON.stringify(INSIDE_THE_HOLD_LINE)});
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0);
      },
    });
    await store.commands.apply({ command: { kind: 'concurrency-set', limit: 6 }, at: ${JSON.stringify(CHANGED_AT)}, context: ECHOED_CONTROL_CONTEXT });
  `;
}

async function firstLineOf(stream: ReadableStream<Uint8Array>): Promise<string> {
  const decoder = new TextDecoder();
  let text = '';
  for await (const chunk of stream) {
    text += decoder.decode(chunk, { stream: true });
    if (text.includes('\n')) break;
  }
  return text.split('\n')[0] ?? '';
}

async function holderBlockedInsideItsHold(workspace: Workspace): Promise<Bun.Subprocess<'ignore', 'pipe', 'pipe'>> {
  const holder = Bun.spawn([process.execPath, '-e', holderInsideItsHoldSource(workspace)], { stdin: 'ignore', stdout: 'pipe', stderr: 'pipe' });
  const firstLine = await firstLineOf(holder.stdout);
  if (firstLine !== INSIDE_THE_HOLD_LINE) throw new Error(`the holder never reached its hold: ${await new Response(holder.stderr).text()}`);
  return holder;
}

async function initialisedStoreIn(prefix: string): Promise<{ workspace: Workspace; store: ReturnType<typeof createLocalFilesBoardStore> }> {
  const workspace = scratchWorkspace(prefix);
  const store     = createLocalFilesBoardStore({ workspace, now: anHourAhead, lockTaker: PLATFORM_TAKER });
  await store.initialise({ project: 'Example Agency', startedAt: STARTED_AT, trackerId: 'example-tracker' });
  return { workspace, store };
}

test('a holder killed inside its hold leaves the lock to the next apply, which takes it at its first attempt, replays the journal and applies', async () => {
  const { workspace, store } = await initialisedStoreIn('lock-killed-holder');
  const holder = await holderBlockedInsideItsHold(workspace);
  expect(existsSync(localStoreLayoutOf(workspace).holdJournalPath)).toBe(true);
  holder.kill('SIGKILL');
  await holder.exited;

  const noteAfterTheCrash = { command: { kind: 'log-note', text: 'Example note after the crash' }, at: CHANGED_AT, context: ECHOED_CONTROL_CONTEXT } as const;
  const { outcome, sleepMilliseconds } = await lockRetryWaitsDuring(() => store.commands.apply(noteAfterTheCrash));

  expect(outcome.settled, outcome.settled === 'rejected' ? String(outcome.reason) : '').toBe('fulfilled');
  expect(sleepMilliseconds, 'the takeover waited out no retry').toEqual([]);
  expect(store.reads.readUnfinishedWrite()).toEqual({ verdict: 'none' });
  expect(store.reads.requireProgress().concurrencyLimit, 'the killed holder\'s journaled write was finished').toBe(6);
  const logReading = store.reads.readLogRecords();
  expect(logReading.verdict === 'readable' ? logReading.records.map((record) => record.kind) : logReading).toEqual(['concurrency-limit-set', 'note']);
}, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);

test('a live holder keeps the lock past any age of its record, and an apply an hour later is refused tracker-lock-held after its retries', async () => {
  const { workspace, store } = await initialisedStoreIn('lock-live-holder');
  const holder = await holderBlockedInsideItsHold(workspace);
  try {
    const note   = { command: { kind: 'log-note', text: 'Example note' }, at: CHANGED_AT, context: ECHOED_CONTROL_CONTEXT } as const;
    const caught = await refusalAfterTheWholeRetryBudget(() => store.commands.apply(note));

    expect(refusalOf(caught)).toEqual({ status: 'unrepaired', detail: { kind: 'tracker-lock-held', lockDirectoryPath: localStoreLayoutOf(workspace).storeLockFolder } });
  } finally {
    holder.kill('SIGKILL');
    await holder.exited;
  }
}, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);
