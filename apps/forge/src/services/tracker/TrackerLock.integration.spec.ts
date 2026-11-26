/**
 * The things `withLock` promises: serialisation, takeover of a lock only once its holder's process is gone (a dead id, or an id that
 * now runs another process), never by the record's age, and the fail-closed direction: a live holder keeps the lock however long it
 * holds, an unreadable record refuses at once, and a path that is not the lock directory is waited for, never assumed free. The crash
 * cases through the store's local adapter are in `src/services/store/LocalFilesBoardStore.integration.spec.ts`.
 */
import {
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync
} from 'node:fs';
import { join }                   from 'node:path';
import { afterAll, expect, test } from 'bun:test';

import { GENERATION_RECORD_FORMAT_VERSION }               from '../../adapters/generation-record/GenerationRecordIngestion.ts';
import { refusalIsOperationRefusal }                      from '../../shared/OperationRefusal.ts';
import { LIMITS }                                         from '../../shared/constants/Limits.ts';
import { CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS }        from '../../testing/ChildProcessCaseTimeout.ts';
import { lockRetryWaitsDuring, parkingLockRetries }       from '../../testing/LockRetryWaits.ts';
import { nativePlatformPorts }                            from '../../testing/NativePlatformPorts.ts';
import { createScratchDirectory, removeScratchDirectory } from '../../testing/ScratchWorkspace.ts';
import { waitUntil }                                      from '../../testing/WaitUntil.ts';
import { LockGenerationSteps }                            from './GenerationLock.ts';
import { localStoreLayoutOf }                             from './LocalStoreLayout.ts';
import { lockHolderOf, lockTakerOf }                      from './LockHolders.ts';
import { withLock }                                       from './TrackerLock.ts';
import { workspacePathsFor }                              from './Workspace.ts';
import type { Workspace }                                 from './Workspace.ts';

const { generationPathFor, generationsIn } = LockGenerationSteps;

const SUPERVISION = nativePlatformPorts().processSupervision;

const PLATFORM_TAKER = lockTakerOf(SUPERVISION);

const AN_HOUR_MILLISECONDS = 3_600_000;

const scratchDirectories: string[] = [];

afterAll(() => {
  for (const directory of scratchDirectories) removeScratchDirectory(directory);
});

function scratchWorkspace(prefix: string): Workspace {
  const rootDirectory = createScratchDirectory(prefix);
  scratchDirectories.push(rootDirectory);
  // A planted `.git` folder: finding the tracker's place runs no git.
  mkdirSync(join(rootDirectory, '.git'), { recursive: true });
  const workspace = workspacePathsFor(rootDirectory);
  mkdirSync(workspace.trackerDirectory, { recursive: true });
  return workspace;
}

const realClock = (): Date => new Date();

const anHourAhead = (): Date => new Date(Date.now() + AN_HOUR_MILLISECONDS);

async function processIdOfAnExitedProcess(): Promise<number> {
  const child = Bun.spawn([process.execPath, '-e', 'process.exit(0)'], { stdout: 'ignore', stderr: 'ignore' });
  const { pid: processId } = child;
  await child.exited;
  return processId;
}

function writeGeneration(lockDirectoryPath: string, generation: number, content: string): void {
  mkdirSync(lockDirectoryPath, { recursive: true });
  writeFileSync(generationPathFor(lockDirectoryPath, generation), content);
}

function newestRecordIn(lockDirectoryPath: string): unknown {
  const newest = (generationsIn(lockDirectoryPath) ?? []).at(-1);
  return newest === undefined ? null : JSON.parse(readFileSync(generationPathFor(lockDirectoryPath, newest), 'utf8'));
}

function heldRecordOf(holder: { processId: number; startStamp: string | null; bootIdentity: string | null }): string {
  return JSON.stringify({
    version: GENERATION_RECORD_FORMAT_VERSION, acquiredAt: new Date().toISOString(), holder, state: 'held'
  });
}

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

test('two overlapping calls run one after the other, never inside one another', async () => {
  const workspace = scratchWorkspace('lock-serialise');
  const observedOrder: string[] = [];

  const { firstResult, secondCall } = await parkingLockRetries(async (parkedRetries) => {
    const firstCall = withLock(workspace, async () => {
      observedOrder.push('first entered');
      await waitUntil(() => parkedRetries() === 1, 'the second call retrying the lock');
      observedOrder.push('first left');
      return 'first';
    }, realClock, PLATFORM_TAKER);
    const overlappingCall = withLock(workspace, () => {
      observedOrder.push('second entered');
      observedOrder.push('second left');
      return 'second';
    }, realClock, PLATFORM_TAKER);
    return { firstResult: await firstCall, secondCall: overlappingCall };
  });

  expect([firstResult, await secondCall]).toEqual(['first', 'second']);
  expect(observedOrder).toEqual(['first entered', 'first left', 'second entered', 'second left']);
});

test('once the action has finished the newest record is a release, and it is the only record left', async () => {
  const workspace = scratchWorkspace('lock-released');
  await withLock(workspace, () => 'done', realClock, PLATFORM_TAKER);
  await withLock(workspace, () => 'done again', realClock, PLATFORM_TAKER);
  expect(newestRecordIn(localStoreLayoutOf(workspace).storeLockFolder)).toMatchObject({ holder: { processId: process.pid }, state: 'released' });
  expect(readdirSync(localStoreLayoutOf(workspace).storeLockFolder), 'generations do not pile up, and no pending file is left').toEqual(['generation-4']);
});

test('an action that throws still gives the lock back', async () => {
  const workspace = scratchWorkspace('lock-released-on-throw');
  await expect(withLock(workspace, () => {
    throw new Error('the action failed');
  }, realClock, PLATFORM_TAKER)).rejects.toThrow('the action failed');
  expect(newestRecordIn(localStoreLayoutOf(workspace).storeLockFolder)).toMatchObject({ state: 'released' });
  expect(await withLock(workspace, () => 'the next command still works', realClock, PLATFORM_TAKER)).toBe('the next command still works');
});

test('the held record names the holding process by its identity, and when it took the lock', async () => {
  const workspace = scratchWorkspace('lock-payload');
  type HeldRecord = { holder: unknown; acquiredAt: string; state: string };
  const readRecord = (): HeldRecord => newestRecordIn(localStoreLayoutOf(workspace).storeLockFolder) as HeldRecord;
  const recordWhileHeld = await withLock(workspace, readRecord, realClock, PLATFORM_TAKER);
  expect(recordWhileHeld.holder).toEqual(lockHolderOf(SUPERVISION));
  expect(recordWhileHeld.state).toBe('held');
  expect(recordWhileHeld.acquiredAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/);
});

test('a lock left behind by a process that no longer exists is taken over at once', async () => {
  // The timestamp is deliberately fresh: the writer being gone is enough on its own.
  const workspace = scratchWorkspace('lock-dead-holder');
  writeGeneration(localStoreLayoutOf(workspace).storeLockFolder, 1, heldRecordOf({ processId: await processIdOfAnExitedProcess(), startStamp: null, bootIdentity: null }));

  const { outcome, sleepMilliseconds } = await lockRetryWaitsDuring(() => withLock(workspace, () => 'taken over', realClock, PLATFORM_TAKER));
  expect(outcome).toEqual({ settled: 'fulfilled', value: 'taken over' });
  expect(sleepMilliseconds, 'the takeover waited out no retry').toEqual([]);
  expect(newestRecordIn(localStoreLayoutOf(workspace).storeLockFolder)).toMatchObject({ holder: { processId: process.pid }, state: 'released' });
}, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);

test('a lock whose recorded holder\'s id now runs another process, as after a reused id, is taken over at once', async () => {
  const workspace = scratchWorkspace('lock-reused-id');
  const thisProcess = lockHolderOf(SUPERVISION);
  if (thisProcess.startStamp === null) throw new Error('this platform reads no start stamp for this process');
  writeGeneration(localStoreLayoutOf(workspace).storeLockFolder, 1, heldRecordOf({ ...thisProcess, startStamp: `${thisProcess.startStamp}0` }));

  const { outcome, sleepMilliseconds } = await lockRetryWaitsDuring(() => withLock(workspace, () => 'taken over', realClock, PLATFORM_TAKER));
  expect(outcome).toEqual({ settled: 'fulfilled', value: 'taken over' });
  expect(sleepMilliseconds).toEqual([]);
});

test('a lock held by this live process is kept however old its record, and refused after the whole retry budget', async () => {
  const workspace = scratchWorkspace('lock-old-live-holder');
  writeGeneration(localStoreLayoutOf(workspace).storeLockFolder, 1, JSON.stringify({
    version: GENERATION_RECORD_FORMAT_VERSION, acquiredAt: '2026-09-18T20:11:03+02:00', holder: lockHolderOf(SUPERVISION), state: 'held'
  }));

  const caught = await refusalAfterTheWholeRetryBudget(() => withLock(workspace, () => 'must not run', anHourAhead, PLATFORM_TAKER));

  expect(refusalOf(caught)).toEqual({ status: 'unrepaired', detail: { kind: 'tracker-lock-held', lockDirectoryPath: localStoreLayoutOf(workspace).storeLockFolder } });
});

test('an unreadable record is refused lock-record-unreadable at once, and the record is left exactly as it was', async () => {
  const workspace = scratchWorkspace('lock-unparseable');
  writeGeneration(localStoreLayoutOf(workspace).storeLockFolder, 1, '');

  const { outcome, sleepMilliseconds } = await lockRetryWaitsDuring(() => withLock(workspace, () => 'must not run', realClock, PLATFORM_TAKER));

  const recordPath = generationPathFor(localStoreLayoutOf(workspace).storeLockFolder, 1);
  expect(refusalOf(outcome.settled === 'rejected' ? outcome.reason : null)).toEqual({ status: 'unrepaired', detail: { kind: 'lock-record-unreadable', recordPath } });
  expect(sleepMilliseconds).toEqual([]);
  expect(readFileSync(recordPath, 'utf8'), 'the record it refused to take is left exactly as it was').toBe('');
});

// A plain file at the lock path, left by an older install, is never treated as free.
// The wording, which calls it a path to remove and never a file, is pinned in `src/adapters/utils/OperationRefusalWordingUtil.spec.ts`.
test('a lock path that is a plain file refuses as a held lock at that path', async () => {
  const workspace = scratchWorkspace('lock-plain-file');
  writeFileSync(localStoreLayoutOf(workspace).storeLockFolder, '');

  const caught = await refusalAfterTheWholeRetryBudget(() => withLock(workspace, () => 'must not run', realClock, PLATFORM_TAKER));

  expect(refusalOf(caught)).toEqual({ status: 'unrepaired', detail: { kind: 'tracker-lock-held', lockDirectoryPath: localStoreLayoutOf(workspace).storeLockFolder } });
  expect(readFileSync(localStoreLayoutOf(workspace).storeLockFolder, 'utf8')).toBe('');
});

test('a record whose holder carries an impossible process id is never signalled with it, and reads as alive', async () => {
  // `process.kill(0, …)` would signal the caller's whole process group, so a non-positive id never reaches it.
  const workspace = scratchWorkspace('lock-impossible-process-id');
  writeGeneration(localStoreLayoutOf(workspace).storeLockFolder, 1, heldRecordOf({ processId: 0, startStamp: null, bootIdentity: null }));

  const caught = await refusalAfterTheWholeRetryBudget(() => withLock(workspace, () => 'must not run', realClock, PLATFORM_TAKER));

  expect(refusalOf(caught)).toMatchObject({ detail: { kind: 'tracker-lock-held' } });
});

test('the action\'s return value is handed back, including when it is not a promise', async () => {
  const workspace = scratchWorkspace('lock-return-value');
  expect(await withLock(workspace, () => ({ id: 18, name: 'Review pass' }), realClock, PLATFORM_TAKER)).toEqual({ id: 18, name: 'Review pass' });
});
