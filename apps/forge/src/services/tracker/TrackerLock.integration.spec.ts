/**
 * The things `withLock` promises: serialisation, takeover of a lock whose holder is gone or overran, and the fail-closed direction — a
 * fresh unreadable record or a path that is not the lock directory is waited for, never assumed free.
 */
import {
  mkdirSync,
  readdirSync,
  readFileSync,
  utimesSync,
  writeFileSync
} from 'node:fs';
import { afterAll, expect, test } from 'bun:test';

import { refusalIsOperationRefusal }                      from '../../shared/OperationRefusal.ts';
import { LIMITS }                                         from '../../shared/constants/Limits.ts';
import { CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS }        from '../../testing/ChildProcessCaseTimeout.ts';
import { lockRetryWaitsDuring, parkingLockRetries }       from '../../testing/LockRetryWaits.ts';
import { nativePlatformPorts }                            from '../../testing/NativePlatformPorts.ts';
import { createScratchDirectory, removeScratchDirectory } from '../../testing/ScratchWorkspace.ts';
import { waitUntil }                                      from '../../testing/WaitUntil.ts';
import { LockGenerationSteps }                            from './GenerationLock.ts';
import { withLock }                                       from './TrackerLock.ts';
import { workspacePathsFor }                              from './Workspace.ts';
import type { Workspace }                                 from './Workspace.ts';

const { generationPathFor, generationsIn } = LockGenerationSteps;

const OVERRUN_HOLDER_ACQUIRED_AT = '2026-09-18T20:11:03+02:00';

const LONG_AFTER_THE_OVERRUN_MILLISECONDS = Date.parse('2026-09-18T21:11:03+02:00');

const HOLDER_IS_GONE = nativePlatformPorts().processSupervision.processIsGone;

const scratchDirectories: string[] = [];

afterAll(() => {
  for (const directory of scratchDirectories) removeScratchDirectory(directory);
});

function scratchWorkspace(prefix: string): Workspace {
  const rootDirectory = createScratchDirectory(prefix);
  scratchDirectories.push(rootDirectory);
  const workspace = workspacePathsFor(rootDirectory);
  mkdirSync(workspace.trackerDirectory, { recursive: true });
  return workspace;
}

const realClock = (): Date => new Date();

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

function deadHolderRecord(deadProcessId: number): string {
  return JSON.stringify({ acquiredAt: new Date().toISOString(), processId: deadProcessId, state: 'held' });
}

function overrunHolderRecord(processId: number): string {
  return JSON.stringify({ acquiredAt: OVERRUN_HOLDER_ACQUIRED_AT, processId, state: 'held' });
}

async function refusalAfterTheWholeRetryBudget(workspace: Workspace): Promise<unknown> {
  const { outcome, sleepMilliseconds } = await lockRetryWaitsDuring(() => withLock(workspace, () => 'must not run', realClock, HOLDER_IS_GONE));
  expect(sleepMilliseconds, 'it waited out the whole retry budget before refusing').toEqual(
    Array.from({ length: LIMITS.LOCK_RETRY_COUNT }, () => LIMITS.LOCK_RETRY_INTERVAL_MILLISECONDS),
  );
  return outcome.settled === 'rejected' ? outcome.reason : null;
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
    }, realClock, HOLDER_IS_GONE);
    const overlappingCall = withLock(workspace, () => {
      observedOrder.push('second entered');
      observedOrder.push('second left');
      return 'second';
    }, realClock, HOLDER_IS_GONE);
    return { firstResult: await firstCall, secondCall: overlappingCall };
  });

  expect([firstResult, await secondCall]).toEqual(['first', 'second']);
  expect(observedOrder).toEqual(['first entered', 'first left', 'second entered', 'second left']);
});

test('once the action has finished the newest record is a release, and it is the only record left', async () => {
  const workspace = scratchWorkspace('lock-released');
  await withLock(workspace, () => 'done', realClock, HOLDER_IS_GONE);
  await withLock(workspace, () => 'done again', realClock, HOLDER_IS_GONE);
  expect(newestRecordIn(workspace.lockDirectoryPath)).toMatchObject({ processId: process.pid, state: 'released' });
  expect(readdirSync(workspace.lockDirectoryPath), 'generations do not pile up, and no pending file is left').toEqual(['generation-4']);
});

test('an action that throws still gives the lock back', async () => {
  const workspace = scratchWorkspace('lock-released-on-throw');
  await expect(withLock(workspace, () => {
    throw new Error('the action failed');
  }, realClock, HOLDER_IS_GONE)).rejects.toThrow('the action failed');
  expect(newestRecordIn(workspace.lockDirectoryPath)).toMatchObject({ state: 'released' });
  expect(await withLock(workspace, () => 'the next command still works', realClock, HOLDER_IS_GONE)).toBe('the next command still works');
});

test('the held record names the process holding it and when it took it', async () => {
  const workspace = scratchWorkspace('lock-payload');
  type HeldRecord = { processId: number; acquiredAt: string; state: string };
  const readRecord = (): HeldRecord => newestRecordIn(workspace.lockDirectoryPath) as HeldRecord;
  const recordWhileHeld = await withLock(workspace, readRecord, realClock, HOLDER_IS_GONE);
  expect(recordWhileHeld.processId).toBe(process.pid);
  expect(recordWhileHeld.state).toBe('held');
  expect(recordWhileHeld.acquiredAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/);
  expect(Number.isNaN(Date.parse(recordWhileHeld.acquiredAt))).toBe(false);
});

test('a lock left behind by a process that no longer exists is taken over at once', async () => {
  // The timestamp is deliberately fresh: the writer being gone is enough on its own.
  const workspace = scratchWorkspace('lock-dead-holder');
  writeGeneration(workspace.lockDirectoryPath, 1, deadHolderRecord(await processIdOfAnExitedProcess()));

  const { outcome, sleepMilliseconds } = await lockRetryWaitsDuring(() => withLock(workspace, () => 'taken over', realClock, HOLDER_IS_GONE));
  expect(outcome).toEqual({ settled: 'fulfilled', value: 'taken over' });
  expect(sleepMilliseconds, 'the takeover waited out no retry').toEqual([]);
  expect(newestRecordIn(workspace.lockDirectoryPath)).toMatchObject({ processId: process.pid, state: 'released' });
}, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);

test('a lock older than the stale threshold is taken over even when its writer is alive', async () => {
  const workspace = scratchWorkspace('lock-old-holder');
  writeGeneration(workspace.lockDirectoryPath, 1, overrunHolderRecord(process.pid));
  const longAfterwards = (): Date => new Date(LONG_AFTER_THE_OVERRUN_MILLISECONDS);
  expect(await withLock(workspace, () => 'taken over', longAfterwards, HOLDER_IS_GONE)).toBe('taken over');
});

test('an unparseable record is taken over only once it is older than the threshold', async () => {
  const workspace = scratchWorkspace('lock-unparseable-old');
  writeGeneration(workspace.lockDirectoryPath, 1, 'this is not JSON');
  const anHourAgoInSeconds = Date.now() / 1000 - 3600;
  utimesSync(generationPathFor(workspace.lockDirectoryPath, 1), anHourAgoInSeconds, anHourAgoInSeconds);
  expect(await withLock(workspace, () => 'taken over', realClock, HOLDER_IS_GONE)).toBe('taken over');
});

test('a freshly written unparseable record is waited for and then refused, rather than assumed free', async () => {
  const workspace = scratchWorkspace('lock-unparseable-fresh');
  writeGeneration(workspace.lockDirectoryPath, 1, '');

  const caught = await refusalAfterTheWholeRetryBudget(workspace);

  expect(refusalIsOperationRefusal(caught)).toBe(true);
  expect(refusalIsOperationRefusal(caught) ? caught.status : null).toBe('unrepaired');
  expect(refusalIsOperationRefusal(caught) ? caught.detail : null).toEqual({ kind: 'tracker-lock-held', lockDirectoryPath: workspace.lockDirectoryPath });
  expect(readFileSync(generationPathFor(workspace.lockDirectoryPath, 1), 'utf8'), 'the record it refused to take is left exactly as it was').toBe('');
});

// A plain file at the lock path, left by an older install, is never treated as free.
// The wording, which calls it a path to remove and never a file, is pinned in `src/adapters/utils/OperationRefusalWordingUtil.spec.ts`.
test('a lock path that is a plain file refuses the same way, as a held lock at that path', async () => {
  const workspace = scratchWorkspace('lock-plain-file');
  writeFileSync(workspace.lockDirectoryPath, '');

  const caught = await refusalAfterTheWholeRetryBudget(workspace);

  expect(refusalIsOperationRefusal(caught)).toBe(true);
  expect(refusalIsOperationRefusal(caught) ? caught.status : null).toBe('unrepaired');
  expect(refusalIsOperationRefusal(caught) ? caught.detail : null).toEqual({ kind: 'tracker-lock-held', lockDirectoryPath: workspace.lockDirectoryPath });
  expect(readFileSync(workspace.lockDirectoryPath, 'utf8')).toBe('');
});

test('a record whose payload carries an impossible process id is never signalled with it', async () => {
  // `process.kill(0, …)` would signal the caller's whole process group, so a non-positive id never reaches it.
  const workspace = scratchWorkspace('lock-impossible-process-id');
  writeGeneration(workspace.lockDirectoryPath, 1, overrunHolderRecord(0));
  const longAfterwards = (): Date => new Date(LONG_AFTER_THE_OVERRUN_MILLISECONDS);
  expect(await withLock(workspace, () => 'taken over', longAfterwards, HOLDER_IS_GONE)).toBe('taken over');
});

test('the action\'s return value is handed back, including when it is not a promise', async () => {
  const workspace = scratchWorkspace('lock-return-value');
  expect(await withLock(workspace, () => ({ id: 18, name: 'Review pass' }), realClock, HOLDER_IS_GONE)).toEqual({ id: 18, name: 'Review pass' });
});
