/**
 * The things the generation lock promises below any tracker: at most one holder when acquirers and releasers interleave at any step of an
 * acquire, a holder that was taken over never releasing its successor, a release that lands where hard links fail, and no generation past
 * the largest safe integer.
 */
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync
} from 'node:fs';
import { join }                   from 'node:path';
import { afterAll, expect, test } from 'bun:test';

import { REAL_FILE_REPLACE_PRIMITIVES }                   from '../../lib/atomic-file/FileReplaceFor.ts';
import { createPosixFileReplace }                         from '../../lib/atomic-file/PosixFileReplace.ts';
import { CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS }        from '../../testing/ChildProcessCaseTimeout.ts';
import { nativePlatformPorts }                            from '../../testing/NativePlatformPorts.ts';
import { createScratchDirectory, removeScratchDirectory } from '../../testing/ScratchWorkspace.ts';
import { LockGenerationSteps }                            from './GenerationLock.ts';

const {
  acquireSteps,
  attemptedAcquire,
  generationPathFor,
  generationsIn,
  release
} = LockGenerationSteps;

const OVERRUN_HOLDER_ACQUIRED_AT = '2026-09-18T20:11:03+02:00';

const RACE_MOMENT_MILLISECONDS = Date.parse('2026-09-24T15:00:30+02:00');

const CLOCK_FIELD_DIGITS = 2;

const HOLDER_IS_GONE = nativePlatformPorts().processSupervision.processIsGone;

const scratchDirectories: string[] = [];

afterAll(() => {
  for (const directory of scratchDirectories) removeScratchDirectory(directory);
});

/** A lock directory not created yet, as on a lock's first use. */
function scratchLockDirectory(prefix: string): string {
  const rootDirectory = createScratchDirectory(prefix);
  scratchDirectories.push(rootDirectory);
  return join(rootDirectory, 'lock');
}

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

// Every waiter in a replayed race is this live process, told apart by its stamp, so none of them can be judged gone.
function payloadOf(secondsPastTheHour: number): { processId: number; acquiredAt: string } {
  return { acquiredAt: `2026-09-24T15:00:${String(secondsPastTheHour).padStart(CLOCK_FIELD_DIGITS, '0')}+02:00`, processId: process.pid };
}

function deadHolderRecord(deadProcessId: number): string {
  return JSON.stringify({ acquiredAt: new Date().toISOString(), processId: deadProcessId, state: 'held' });
}

function overrunHolderRecord(processId: number): string {
  return JSON.stringify({ acquiredAt: OVERRUN_HOLDER_ACQUIRED_AT, processId, state: 'held' });
}

test('where hard links fail a release still lands, so no held generation is stranded', () => {
  const lockDirectoryPath = scratchLockDirectory('lock-without-links');
  writeGeneration(lockDirectoryPath, 1, JSON.stringify({ ...payloadOf(1), state: 'held' }));
  const fileReplaceWithoutLinks = createPosixFileReplace({
    ...REAL_FILE_REPLACE_PRIMITIVES,
    link: () => {
      throw Object.assign(new Error('no links here'), { code: 'ENOTSUP' });
    },
  });

  release(lockDirectoryPath, 1, payloadOf(1), fileReplaceWithoutLinks);

  expect(newestRecordIn(lockDirectoryPath)).toEqual({ ...payloadOf(1), state: 'released' });
  expect(generationsIn(lockDirectoryPath)).toEqual([2]);
});

// A taker that judged a live holder stale can act only after that holder released and a plain acquirer took the lock; exactly one must hold it.
test('a holder that releases after a taker judged it stale, followed by a plain acquirer, still leaves exactly one holder', () => {
  const lockDirectoryPath = scratchLockDirectory('lock-release-during-takeover');
  writeGeneration(lockDirectoryPath, 1, overrunHolderRecord(process.pid));
  const plainAcquirer = payloadOf(1);
  let plainAcquirerVerdict = '';

  const takerAttempt = attemptedAcquire(lockDirectoryPath, payloadOf(2), RACE_MOMENT_MILLISECONDS, HOLDER_IS_GONE, (step) => {
    if (step !== 'newest-judged-free') return;
    release(lockDirectoryPath, 1, payloadOf(3));
    plainAcquirerVerdict = attemptedAcquire(lockDirectoryPath, plainAcquirer, RACE_MOMENT_MILLISECONDS, HOLDER_IS_GONE).verdict;
  });
  const fourthAcquirerVerdict = attemptedAcquire(lockDirectoryPath, payloadOf(4), RACE_MOMENT_MILLISECONDS, HOLDER_IS_GONE).verdict;

  expect(plainAcquirerVerdict).toBe('acquired');
  expect(takerAttempt.verdict, 'the taker finds the generation it judged already moved past').toBe('contended');
  expect(fourthAcquirerVerdict, 'the plain acquirer\'s fresh lock is waited for').toBe('held');
  expect(newestRecordIn(lockDirectoryPath)).toEqual({ ...plainAcquirer, state: 'held' });
});

// Every step boundary of one acquire, with a second acquirer running whole inside it: the claim is one holder whatever the interleaving.
test('while a waiter takes over a dead holder\'s lock, another acquiring at any step leaves exactly one holder', async () => {
  expect(acquireSteps.length).toBeGreaterThan(0);
  const stepsReached = new Set<string>();
  for (const intrusionStep of acquireSteps) {
    const lockDirectoryPath = scratchLockDirectory('lock-dead-holder-intrusion');
    writeGeneration(lockDirectoryPath, 1, deadHolderRecord(await processIdOfAnExitedProcess()));
    let intruderVerdict = '';
    const takerAttempt = attemptedAcquire(lockDirectoryPath, payloadOf(1), RACE_MOMENT_MILLISECONDS, HOLDER_IS_GONE, (step) => {
      stepsReached.add(step);
      if (step === intrusionStep) intruderVerdict = attemptedAcquire(lockDirectoryPath, payloadOf(2), RACE_MOMENT_MILLISECONDS, HOLDER_IS_GONE).verdict;
    });

    expect([intruderVerdict, takerAttempt.verdict].filter((verdict) => verdict === 'acquired').length, `holders with the intruder acquiring at ${intrusionStep}`).toBe(1);
  }
  expect([...stepsReached].sort(), 'every step boundary ran its intrusion').toEqual([...acquireSteps].sort());
}, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);

// A slow acquirer can judge a generation that the holders after it have since removed, recreate it, and must then see the newer one.
test('an acquirer that recreates a generation removed while it was judging finds the newer one and does not hold', () => {
  const lockDirectoryPath = scratchLockDirectory('lock-recreated-generation');
  const firstHolder = payloadOf(1);
  const secondHolder = payloadOf(2);
  let secondHolderGeneration = 0;

  const slowAttempt = attemptedAcquire(lockDirectoryPath, payloadOf(3), RACE_MOMENT_MILLISECONDS, HOLDER_IS_GONE, (step) => {
    if (step !== 'newest-judged-free') return;
    const firstAttempt = attemptedAcquire(lockDirectoryPath, firstHolder, RACE_MOMENT_MILLISECONDS, HOLDER_IS_GONE);
    if (firstAttempt.verdict === 'acquired') release(lockDirectoryPath, firstAttempt.generation, firstHolder);
    const secondAttempt = attemptedAcquire(lockDirectoryPath, secondHolder, RACE_MOMENT_MILLISECONDS, HOLDER_IS_GONE);
    if (secondAttempt.verdict === 'acquired') secondHolderGeneration = secondAttempt.generation;
  });

  expect(secondHolderGeneration, 'the generation the slow acquirer judged was removed under it').toBe(3);
  expect(slowAttempt.verdict).toBe('contended');
  expect(newestRecordIn(lockDirectoryPath)).toEqual({ ...secondHolder, state: 'held' });
});

test('a holder taken over as stale releases nothing, and its successor keeps the lock', () => {
  const lockDirectoryPath = scratchLockDirectory('lock-release-after-takeover');
  writeGeneration(lockDirectoryPath, 1, overrunHolderRecord(process.pid));
  const successor = payloadOf(1);

  expect(attemptedAcquire(lockDirectoryPath, successor, RACE_MOMENT_MILLISECONDS, HOLDER_IS_GONE).verdict).toBe('acquired');
  release(lockDirectoryPath, 1, payloadOf(2));

  expect(newestRecordIn(lockDirectoryPath)).toEqual({ ...successor, state: 'held' });
  expect(attemptedAcquire(lockDirectoryPath, payloadOf(3), RACE_MOMENT_MILLISECONDS, HOLDER_IS_GONE).verdict).toBe('held');
});

// A generation past the largest safe integer is invisible to every listing, so claiming one would let a second acquirer start again at 1.
test('a free record at the largest safe generation is never moved past, so at most one acquirer holds', async () => {
  const lockDirectoryPath = scratchLockDirectory('lock-largest-generation');
  writeGeneration(lockDirectoryPath, Number.MAX_SAFE_INTEGER, deadHolderRecord(await processIdOfAnExitedProcess()));

  const verdicts = [payloadOf(1), payloadOf(2)].map((payload) => attemptedAcquire(lockDirectoryPath, payload, RACE_MOMENT_MILLISECONDS, HOLDER_IS_GONE).verdict);

  expect(verdicts.filter((verdict) => verdict === 'acquired').length, 'holders after two acquirers').toBeLessThanOrEqual(1);
  expect(verdicts).toEqual(['held', 'held']);
  expect(generationsIn(lockDirectoryPath)).toEqual([Number.MAX_SAFE_INTEGER]);
}, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);

test('a holder at the largest safe generation releases nothing it could not list, and its record stays the newest', () => {
  const lockDirectoryPath = scratchLockDirectory('lock-largest-generation-release');
  const holder = payloadOf(1);
  writeGeneration(lockDirectoryPath, Number.MAX_SAFE_INTEGER, JSON.stringify({ ...holder, state: 'held' }));

  release(lockDirectoryPath, Number.MAX_SAFE_INTEGER, payloadOf(2));

  expect(readdirSync(lockDirectoryPath)).toEqual([`generation-${Number.MAX_SAFE_INTEGER}`]);
  expect(attemptedAcquire(lockDirectoryPath, payloadOf(3), RACE_MOMENT_MILLISECONDS, HOLDER_IS_GONE).verdict).toBe('held');
});

test('a released lock is taken by the next acquirer, whose record is complete the moment it exists', () => {
  const lockDirectoryPath = scratchLockDirectory('lock-complete-record');
  const holder = payloadOf(1);
  let recordAtCreation: unknown = null;
  attemptedAcquire(lockDirectoryPath, holder, RACE_MOMENT_MILLISECONDS, HOLDER_IS_GONE, (step) => {
    if (step === 'generation-created') recordAtCreation = newestRecordIn(lockDirectoryPath);
  });
  expect(recordAtCreation).toEqual({ ...holder, state: 'held' });
  expect(existsSync(lockDirectoryPath)).toBe(true);
});
