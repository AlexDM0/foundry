/** Lock takers for a spec that judges a holder itself, so no spec reads a process identity from the platform to take a lock. */
import type { LockHolder, LockHolderIsGone, LockTaker } from '../services/tracker/GenerationLock.ts';

/** This process with no identity read, as a platform that cannot read one records it. */
export function specLockHolder(): LockHolder {
  return { processId: process.pid, startStamp: null, bootIdentity: null };
}

export function lockTakerJudgingHoldersBy(holderIsGone: LockHolderIsGone): LockTaker {
  return { holderOfThisProcess: specLockHolder, holderIsGone };
}

/** Every holder it finds reads as alive, so only a released record frees the lock. */
export const LIVE_HOLDERS_LOCK_TAKER: LockTaker = Object.freeze({ holderOfThisProcess: specLockHolder, holderIsGone: () => false });

/** Every holder it finds reads as gone, as a platform that misjudged a running holder would. */
export const GONE_HOLDERS_LOCK_TAKER: LockTaker = Object.freeze({ holderOfThisProcess: specLockHolder, holderIsGone: () => true });
