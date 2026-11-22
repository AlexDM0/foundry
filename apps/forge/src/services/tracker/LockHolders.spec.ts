/**
 * A lock passes only from a holder whose process is gone, judged by the same identity stage 3 judges a Hephaestus lock by: a process id is not a
 * process, so a live id whose start stamp or boot differs from the record's names another process, and the holder is gone. Where the
 * platform cannot tell, from an identity it cannot read or a record that carries none, the holder reads as alive, never as gone.
 */
import { describe, expect, test } from 'bun:test';

import type { ProcessIdentity }                          from '../../lib/process-identity/ProcessIdentity.ts';
import { UNREADABLE_BOOT_IDENTITY }                      from '../../lib/process-identity/ProcessIdentity.ts';
import type { ProcessSupervision }                       from '../../lib/process-identity/ProcessSupervision.ts';
import { createUnsupportedProcessSupervision }           from '../../lib/process-identity/UnsupportedProcessSupervision.ts';
import type { LockHolder }                               from './GenerationLock.ts';
import { lockHolderIsGoneOf, lockHolderOf, lockTakerOf } from './LockHolders.ts';

const HOLDER_PROCESS_ID = 4242;
const RECORDED_HOLDER: LockHolder = { processId: HOLDER_PROCESS_ID, startStamp: '1763370000', bootIdentity: 'example-boot' };

/** The platform as the case sees it: which ids run, and the identity it reads at each, or `null` where it reads none. */
function supervisionSeeing(identities: ReadonlyMap<number, ProcessIdentity | null>): ProcessSupervision & { identityReads: () => number } {
  let identityReads = 0;
  return {
    ...createUnsupportedProcessSupervision('example'),
    processIsGone: (processId) => !identities.has(processId),
    identityOf:    (processId) => {
      identityReads += 1;
      return identities.get(processId) ?? null;
    },
    identityReads: () => identityReads,
  };
}

function runningAtTheHoldersId(identity: ProcessIdentity | null): ProcessSupervision {
  return supervisionSeeing(new Map([[HOLDER_PROCESS_ID, identity]]));
}

describe('a recorded holder', () => {
  test('is gone when its process id is gone', () => {
    expect(lockHolderIsGoneOf(supervisionSeeing(new Map()))(RECORDED_HOLDER)).toBe(true);
  });

  test('is gone when its id now runs a process with another start stamp, as after a reused id', () => {
    const reused = { processId: HOLDER_PROCESS_ID, startStamp: '1763379999', bootIdentity: 'example-boot' };
    expect(lockHolderIsGoneOf(runningAtTheHoldersId(reused))(RECORDED_HOLDER)).toBe(true);
  });

  test('is gone when its id now runs a process of another boot, as after a reboot', () => {
    const afterReboot = { processId: HOLDER_PROCESS_ID, startStamp: '1763370000', bootIdentity: 'example-later-boot' };
    expect(lockHolderIsGoneOf(runningAtTheHoldersId(afterReboot))(RECORDED_HOLDER)).toBe(true);
  });

  test('is alive while its id runs the recorded process', () => {
    expect(lockHolderIsGoneOf(runningAtTheHoldersId({ ...RECORDED_HOLDER, startStamp: '1763370000', bootIdentity: 'example-boot' }))(RECORDED_HOLDER)).toBe(false);
  });

  test('is alive while its id lives and the platform reads the process\'s boot as unreadable, which proves no reboot', () => {
    const unreadableBoot = { processId: HOLDER_PROCESS_ID, startStamp: '1763370000', bootIdentity: UNREADABLE_BOOT_IDENTITY };
    expect(lockHolderIsGoneOf(runningAtTheHoldersId(unreadableBoot))(RECORDED_HOLDER)).toBe(false);
  });

  test('is alive while its id lives and the platform cannot read the identity there', () => {
    expect(lockHolderIsGoneOf(runningAtTheHoldersId(null))(RECORDED_HOLDER)).toBe(false);
  });

  test('is alive while its id lives when the record carries no identity, whatever process runs there now', () => {
    const recordedWithoutIdentity: LockHolder = { processId: HOLDER_PROCESS_ID, startStamp: null, bootIdentity: null };
    const another = { processId: HOLDER_PROCESS_ID, startStamp: '1763379999', bootIdentity: 'example-later-boot' };
    expect(lockHolderIsGoneOf(runningAtTheHoldersId(another))(recordedWithoutIdentity)).toBe(false);
  });
});

describe('this process as a holder', () => {
  test('is recorded with the identity the platform reads for it', () => {
    const own = { processId: process.pid, startStamp: '1763370500', bootIdentity: 'example-boot' };
    expect(lockHolderOf(supervisionSeeing(new Map([[process.pid, own]])))).toEqual(own);
  });

  test('is recorded with no identity where the platform reads none', () => {
    expect(lockHolderOf(supervisionSeeing(new Map()))).toEqual({ processId: process.pid, startStamp: null, bootIdentity: null });
  });

  test('is read once per supervision, at its first lock, however many takers and locks share it', () => {
    const supervision = supervisionSeeing(new Map([[process.pid, { processId: process.pid, startStamp: '1763370500', bootIdentity: 'example-boot' }]]));
    const firstTaker  = lockTakerOf(supervision);
    const secondTaker = lockTakerOf(supervision);
    expect(supervision.identityReads()).toBe(0);

    expect(firstTaker.holderOfThisProcess()).toEqual(secondTaker.holderOfThisProcess());
    expect(firstTaker.holderOfThisProcess()).toEqual(lockHolderOf(supervision));
    expect(supervision.identityReads()).toBe(1);
  });
});
