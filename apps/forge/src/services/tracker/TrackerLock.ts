/**
 * One writer at a time in a tracker, across processes: the generation lock on the tracker's lock directory, under which any hold journal a
 * cut-short hold left is replayed before the action runs.
 */
import { type HoldFence, type LockHolderIsGone, withLockAt } from './GenerationLock.ts';
import { replayHoldJournal }                                 from './HoldJournal.ts';
import { localStoreLayoutOf }                                from './LocalStoreLayout.ts';
import type { Workspace }                                    from './Workspace.ts';

function replayingTheJournalFirst<ActionResult>(
  workspace: Workspace,
  action: (hold: HoldFence) => Promise<ActionResult> | ActionResult,
): (hold: HoldFence) => Promise<ActionResult> | ActionResult {
  return (hold) => {
    replayHoldJournal(workspace, hold);
    return action(hold);
  };
}

/**
 * Run `action` with this tracker's lock held, releasing it however `action` ends, after replaying any hold journal a cut-short hold left.
 * A held record is taken over once its process is gone or its stamp is more than `LIMITS.LOCK_STALE_MILLISECONDS` old, live holder or not;
 * one stamped in the future by a live holder never goes stale. Throws `OperationRefusal('unrepaired')`, its detail `tracker-lock-held` — exit
 * 2 — when the retry budget runs out.
 */
export function withLock<ActionResult>(
  workspace: Workspace,
  action: (hold: HoldFence) => Promise<ActionResult> | ActionResult,
  now: () => Date,
  holderIsGone: LockHolderIsGone,
): Promise<ActionResult> {
  return withLockAt(localStoreLayoutOf(workspace).storeLockFolder, replayingTheJournalFirst(workspace, action), now, holderIsGone);
}
