/**
 * Whether a held record frees the lock rests on the taker's judgement of its holder, never on the record's age: a holder judged gone (even a
 * Linux zombie a signal probe still reaches) frees it at once, one judged alive keeps it; an unreadable shape is stale and taken over, while a
 * read that fails now holds, since that failure says nothing of the holder. A holder that waited is stamped when it takes the lock.
 */
import {
  chmodSync,
  mkdirSync,
  readFileSync,
  writeFileSync
} from 'node:fs';
import {
  afterAll,
  describe,
  expect,
  test
} from 'bun:test';

import { GENERATION_RECORD_FORMAT_VERSION }               from '../../adapters/generation-record/GenerationRecordIngestion.ts';
import { LocalTimeUtil }                                  from '../../lib/local-time/LocalTimeUtil.ts';
import { refusalIsOperationRefusal }                      from '../../shared/OperationRefusal.ts';
import { lockRetryWaitsDuring }                           from '../../testing/LockRetryWaits.ts';
import { lockTakerJudgingHoldersBy }                      from '../../testing/LockTakers.ts';
import { createScratchDirectory, removeScratchDirectory } from '../../testing/ScratchWorkspace.ts';
import {
  type LockHolder,
  LockGenerationSteps,
  type LockHolderIsGone,
  type StaleLockRecordTakenOver,
  withLockAt
} from './GenerationLock.ts';

const ZOMBIE_HOLDER: LockHolder = { processId: 4242, startStamp: '1763370000', bootIdentity: 'example-boot' };
const HELD_AT = '2026-09-24T15:00:00+02:00';
const ONE_SECOND_LATER_MILLISECONDS = Date.parse('2026-09-24T15:00:01+02:00');
const ONE_HOUR_LATER = new Date(Date.parse('2026-09-24T16:00:00+02:00'));
const THIS_HOLDER: LockHolder = { processId: 4343, startStamp: '1763370100', bootIdentity: 'example-boot' };
const NO_ACCESS_MODE = 0o000;
const OWNER_READ_WRITE_MODE = 0o600;

const scratchDirectories: string[] = [];

afterAll(() => {
  for (const directory of scratchDirectories) removeScratchDirectory(directory);
});

function lockFolderHolding(recordText: string): string {
  const lockDirectoryPath = createScratchDirectory('lock-holder');
  scratchDirectories.push(lockDirectoryPath);
  mkdirSync(lockDirectoryPath, { recursive: true });
  writeFileSync(LockGenerationSteps.generationPathFor(lockDirectoryPath, 1), recordText);
  return lockDirectoryPath;
}

function lockHeldByTheZombie(): string {
  return lockFolderHolding(JSON.stringify({
    version: GENERATION_RECORD_FORMAT_VERSION, holder: ZOMBIE_HOLDER, acquiredAt: HELD_AT, state: 'held'
  }));
}

function verdictUnder(holderIsGone: LockHolderIsGone): string {
  const asked: LockHolder[] = [];
  const { verdict } = LockGenerationSteps.attemptedAcquire(lockHeldByTheZombie(), { holder: THIS_HOLDER, acquiredAt: HELD_AT }, (holder) => {
    asked.push(holder);
    return holderIsGone(holder);
  });
  expect(asked).toEqual([ZOMBIE_HOLDER]);
  return verdict;
}

describe('a held record', () => {
  test('is free once the taker judges its holder gone, as the Linux supervision reads a zombie, and is judged by the whole recorded identity', () => {
    expect(verdictUnder(() => true)).toBe('acquired');
  });

  test('stays held while the taker judges its holder alive, as for a process of another user', () => {
    expect(verdictUnder(() => false)).toBe('held');
  });

  test('stays held by a live holder with now an hour past its stamp: the record\'s age frees nothing', async () => {
    const lockDirectoryPath = lockHeldByTheZombie();
    const { outcome } = await lockRetryWaitsDuring(() => withLockAt(lockDirectoryPath, () => 'taken', () => ONE_HOUR_LATER, lockTakerJudgingHoldersBy(() => false)));

    const reason = outcome.settled === 'rejected' ? outcome.reason : null;
    expect(refusalIsOperationRefusal(reason) ? reason.detail : null).toEqual({ kind: 'tracker-lock-held', lockDirectoryPath });
  });

  test('a released record is free without judging its holder', () => {
    const lockDirectoryPath = lockFolderHolding(JSON.stringify({
      version: GENERATION_RECORD_FORMAT_VERSION, holder: ZOMBIE_HOLDER, acquiredAt: HELD_AT, state: 'released'
    }));
    const judged: LockHolder[] = [];
    const attempt = LockGenerationSteps.attemptedAcquire(lockDirectoryPath, { holder: THIS_HOLDER, acquiredAt: HELD_AT }, (holder) => {
      judged.push(holder);
      return false;
    });

    expect(attempt.verdict).toBe('acquired');
    expect(judged).toEqual([]);
  });
});

describe('a record without a version, as older code wrote', () => {
  const versionlessHeldRecord = JSON.stringify({ holder: ZOMBIE_HOLDER, acquiredAt: HELD_AT, state: 'held' });

  test('stays held while the taker judges its holder alive', () => {
    const attempt = LockGenerationSteps.attemptedAcquire(lockFolderHolding(versionlessHeldRecord), { holder: THIS_HOLDER, acquiredAt: HELD_AT }, () => false);
    expect(attempt.verdict).toBe('held');
  });

  test('is taken over once its holder is gone, logged, and the next generation is written with the current version', async () => {
    const lockDirectoryPath = lockFolderHolding(versionlessHeldRecord);
    const takenOver: StaleLockRecordTakenOver[] = [];
    const readTakenRecord = (): unknown => JSON.parse(readFileSync(LockGenerationSteps.generationPathFor(lockDirectoryPath, 2), 'utf8'));

    const takerJudgingEveryHolderGone = lockTakerJudgingHoldersBy(() => true, (staleTakenOver) => takenOver.push(staleTakenOver));
    const heldRecord = await withLockAt(lockDirectoryPath, readTakenRecord, () => ONE_HOUR_LATER, takerJudgingEveryHolderGone);

    expect(heldRecord).toMatchObject({ version: GENERATION_RECORD_FORMAT_VERSION, state: 'held' });
    const recordPath = LockGenerationSteps.generationPathFor(lockDirectoryPath, 1);
    expect(takenOver).toEqual([{ recordPath, reason: { kind: 'holder-gone', processId: ZOMBIE_HOLDER.processId } }]);
  });
});

describe('an unreadable record', () => {
  for (const [title, recordText] of [
    ['text that is no JSON', '{"state": "held", "hol'],
    ['a record naming its holder by process id alone, as before process identity', JSON.stringify({
      version: GENERATION_RECORD_FORMAT_VERSION, processId: 4242, acquiredAt: HELD_AT, state: 'held'
    })],
    ['a held record naming no holder', JSON.stringify({ version: GENERATION_RECORD_FORMAT_VERSION, acquiredAt: HELD_AT, state: 'held' })],
    ['a record of no known state', JSON.stringify({
      version: GENERATION_RECORD_FORMAT_VERSION, holder: ZOMBIE_HOLDER, acquiredAt: HELD_AT, state: 'leased'
    })],
  ] as const) {
    test(`is taken over at the first attempt, with no refusal, and logged: ${title}`, async () => {
      const lockDirectoryPath = lockFolderHolding(recordText);
      const takenOver: StaleLockRecordTakenOver[] = [];
      const takerJudgingEveryHolderAlive = lockTakerJudgingHoldersBy(() => false, (staleTakenOver) => takenOver.push(staleTakenOver));
      const { outcome, sleepMilliseconds } = await lockRetryWaitsDuring(() => withLockAt(lockDirectoryPath, () => 'taken', () => ONE_HOUR_LATER, takerJudgingEveryHolderAlive));

      expect(outcome).toEqual({ settled: 'fulfilled', value: 'taken' });
      expect(sleepMilliseconds).toEqual([]);
      const recordPath = LockGenerationSteps.generationPathFor(lockDirectoryPath, 1);
      expect(takenOver).toEqual([{ recordPath, reason: { kind: 'unreadable', problem: expect.any(Object) as unknown as { code: 'not-a-json-object' } } }]);
    });
  }
});

describe('a record whose bytes cannot be read now', () => {
  test('fails closed, as a read failure says nothing of its holder: the acquisition is held and nothing is taken over', () => {
    const lockDirectoryPath = lockHeldByTheZombie();
    const recordPath = LockGenerationSteps.generationPathFor(lockDirectoryPath, 1);
    chmodSync(recordPath, NO_ACCESS_MODE);
    try {
      expect(LockGenerationSteps.attemptedAcquire(lockDirectoryPath, { holder: THIS_HOLDER, acquiredAt: HELD_AT }, () => true)).toEqual({ verdict: 'held' });
    } finally {
      chmodSync(recordPath, OWNER_READ_WRITE_MODE);
    }
    expect(LockGenerationSteps.generationsIn(lockDirectoryPath)).toEqual([1]);
  });
});

describe('a holder that takes the lock', () => {
  test('records the taker\'s holder by its process identity', async () => {
    const lockDirectoryPath = lockHeldByTheZombie();
    const taker = { holderOfThisProcess: () => THIS_HOLDER, holderIsGone: () => true, onStaleTakenOver: () => {} };

    const readTakenRecord = (): unknown => JSON.parse(readFileSync(LockGenerationSteps.generationPathFor(lockDirectoryPath, 2), 'utf8'));

    const heldRecord = await withLockAt(lockDirectoryPath, readTakenRecord, () => ONE_HOUR_LATER, taker);

    expect(heldRecord).toEqual({
      version: GENERATION_RECORD_FORMAT_VERSION, holder: THIS_HOLDER, acquiredAt: LocalTimeUtil.formatLocalIso(ONE_HOUR_LATER), state: 'held'
    });
  });

  test('is stamped with the moment it took the lock, not the moment it began to wait', async () => {
    const lockDirectoryPath = lockHeldByTheZombie();
    const waitedUntil = new Date(ONE_SECOND_LATER_MILLISECONDS + 5000);
    let holderReadAsGone = false;
    const now = (): Date => (holderReadAsGone ? waitedUntil : new Date(ONE_SECOND_LATER_MILLISECONDS));
    const holderIsGone: LockHolderIsGone = () => {
      const answer = holderReadAsGone;
      holderReadAsGone = true;
      return answer;
    };

    const heldRecord = await withLockAt(lockDirectoryPath, () => {
      const newestGeneration = (LockGenerationSteps.generationsIn(lockDirectoryPath) ?? []).at(-1) ?? 0;
      return JSON.parse(readFileSync(LockGenerationSteps.generationPathFor(lockDirectoryPath, newestGeneration), 'utf8')) as unknown;
    }, now, lockTakerJudgingHoldersBy(holderIsGone));

    expect(heldRecord).toMatchObject({ state: 'held', acquiredAt: LocalTimeUtil.formatLocalIso(waitedUntil) });
  });
});
