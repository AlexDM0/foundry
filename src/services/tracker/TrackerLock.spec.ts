/**
 * Whether a fresh held record frees the lock rests on the caller's process check alone: a holder the check reads as gone, such as a Linux
 * zombie that a signal probe still reaches, frees it at once, and a holder it reads as live keeps it until its stamp is stale.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import {
  afterAll,
  describe,
  expect,
  test
} from 'bun:test';

import { createScratchDirectory, removeScratchDirectory } from '../../testing/ScratchWorkspace.ts';
import { LockGenerationSteps, type LockHolderIsGone }     from './TrackerLock.ts';

const ZOMBIE_HOLDER_PROCESS_ID = 4242;
const HELD_AT = '2026-09-24T15:00:00+02:00';
const ONE_SECOND_LATER_MILLISECONDS = Date.parse('2026-09-24T15:00:01+02:00');

const scratchDirectories: string[] = [];

afterAll(() => {
  for (const directory of scratchDirectories) removeScratchDirectory(directory);
});

function lockHeldByTheZombie(): string {
  const lockDirectoryPath = createScratchDirectory('lock-zombie-holder');
  scratchDirectories.push(lockDirectoryPath);
  mkdirSync(lockDirectoryPath, { recursive: true });
  writeFileSync(
    LockGenerationSteps.generationPathFor(lockDirectoryPath, 1),
    JSON.stringify({ processId: ZOMBIE_HOLDER_PROCESS_ID, acquiredAt: HELD_AT, state: 'held' }),
  );
  return lockDirectoryPath;
}

function verdictUnder(holderIsGone: LockHolderIsGone): string {
  const asked: number[] = [];
  const { verdict } = LockGenerationSteps.attemptedAcquire(
    lockHeldByTheZombie(),
    { processId: process.pid, acquiredAt: HELD_AT },
    ONE_SECOND_LATER_MILLISECONDS,
    (processId) => {
      asked.push(processId);
      return holderIsGone(processId);
    },
  );
  expect(asked).toEqual([ZOMBIE_HOLDER_PROCESS_ID]);
  return verdict;
}

describe('a fresh held record', () => {
  test('is free once the process check reads its holder as gone, as the Linux supervision reads a zombie', () => {
    expect(verdictUnder(() => true)).toBe('acquired');
  });

  test('stays held while the process check reads its holder as live, as for a process of another user', () => {
    expect(verdictUnder(() => false)).toBe('held');
  });
});
