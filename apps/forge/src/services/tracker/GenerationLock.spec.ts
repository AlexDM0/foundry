/**
 * Whether a held record frees the lock rests on the taker's judgement of its holder alone, never on the record's age: a holder judged
 * gone, such as a Linux zombie that a signal probe still reaches, frees it at once, and a holder judged alive keeps it however old its
 * stamp. A record of today's fields without a version, as older code wrote, is judged by its holder the same way. A stale record, its
 * holder gone or the record unreadable, is taken over at once and logged, with no refusal. A holder that waited for the lock is stamped
 * when it takes it, and writes the current version.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
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
  withLockAt
} from './GenerationLock.ts';

const ZOMBIE_HOLDER: LockHolder = { processId: 4242, startStamp: '1763370000', bootIdentity: 'example-boot' };
const HELD_AT = '2026-09-24T15:00:00+02:00';
const ONE_SECOND_LATER_MILLISECONDS = Date.parse('2026-09-24T15:00:01+02:00');
const ONE_HOUR_LATER = new Date(Date.parse('2026-09-24T16:00:00+02:00'));
const THIS_HOLDER: LockHolder = { processId: 4343, startStamp: '1763370100', bootIdentity: 'example-boot' };

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
    const loggedLines: string[] = [];
    const readTakenRecord = (): unknown => JSON.parse(readFileSync(LockGenerationSteps.generationPathFor(lockDirectoryPath, 2), 'utf8'));

    const heldRecord = await withLockAt(lockDirectoryPath, readTakenRecord, () => ONE_HOUR_LATER, lockTakerJudgingHoldersBy(() => true, (line) => loggedLines.push(line)));

    expect(heldRecord).toMatchObject({ version: GENERATION_RECORD_FORMAT_VERSION, state: 'held' });
    const recordPath = LockGenerationSteps.generationPathFor(lockDirectoryPath, 1);
    expect(loggedLines).toEqual([`The lock record ${recordPath} was stale and is taken over: the process ${ZOMBIE_HOLDER.processId} it names is gone.`]);
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
      const loggedLines: string[] = [];
      const takerJudgingEveryHolderAlive = lockTakerJudgingHoldersBy(() => false, (line) => loggedLines.push(line));
      const { outcome, sleepMilliseconds } = await lockRetryWaitsDuring(() => withLockAt(lockDirectoryPath, () => 'taken', () => ONE_HOUR_LATER, takerJudgingEveryHolderAlive));

      expect(outcome).toEqual({ settled: 'fulfilled', value: 'taken' });
      expect(sleepMilliseconds).toEqual([]);
      const recordPath = LockGenerationSteps.generationPathFor(lockDirectoryPath, 1);
      expect(loggedLines).toEqual([expect.stringContaining(`The lock record ${recordPath} was stale and is taken over: it could not be read (`)]);
    });
  }
});

describe('a holder that takes the lock', () => {
  test('records the taker\'s holder by its process identity', async () => {
    const lockDirectoryPath = lockHeldByTheZombie();
    const taker = { holderOfThisProcess: () => THIS_HOLDER, holderIsGone: () => true, log: () => {} };

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
