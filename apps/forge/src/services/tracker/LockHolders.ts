/**
 * A lock's holder judged by process identity, as stage 3 judges a Baton's: a process id with its start stamp and boot, so a reused id
 * or a reboot never reads as the holder. Where the platform cannot tell, the holder reads as alive: a lock is never taken from a
 * process that may still run.
 */
import type { ProcessIdentity }                         from '../../lib/process-identity/ProcessIdentity.ts';
import type { ProcessSupervision }                      from '../../lib/process-identity/ProcessSupervision.ts';
import type { LockHolder, LockHolderIsGone, LockTaker } from './GenerationLock.ts';

/** This process's holder per supervision, which a process builds once with its platform ports: read at its first lock only. */
const holderOfThisProcessBySupervision = new WeakMap<ProcessSupervision, LockHolder>();

export function lockHolderOf(supervision: ProcessSupervision): LockHolder {
  const readHolder = holderOfThisProcessBySupervision.get(supervision);
  if (readHolder !== undefined) return readHolder;
  const identity = supervision.identityOf(process.pid);
  const holder   = { processId: process.pid, startStamp: identity?.startStamp ?? null, bootIdentity: identity?.bootIdentity ?? null };
  holderOfThisProcessBySupervision.set(supervision, holder);
  return holder;
}

function recordedIdentityOf(holder: LockHolder): ProcessIdentity | null {
  const { processId, startStamp, bootIdentity } = holder;
  return startStamp === null || bootIdentity === null ? null : { processId, startStamp, bootIdentity };
}

/** True only when the platform knows: the id is gone, or the process at it is not the recorded one. */
export function lockHolderIsGoneOf(supervision: ProcessSupervision): LockHolderIsGone {
  return (holder) => {
    if (supervision.processIsGone(holder.processId)) return true;
    const recordedIdentity = recordedIdentityOf(holder);
    if (recordedIdentity === null) return false;
    const currentIdentity = supervision.identityOf(holder.processId);
    return currentIdentity !== null && !supervision.sameProcess(currentIdentity, recordedIdentity);
  };
}

/** This process as a lock's taker on this platform: the holder it writes and the judgement it passes, from one supervision. */
export function lockTakerOf(supervision: ProcessSupervision): LockTaker {
  return {
    holderOfThisProcess: () => lockHolderOf(supervision),
    holderIsGone:        lockHolderIsGoneOf(supervision),
  };
}
