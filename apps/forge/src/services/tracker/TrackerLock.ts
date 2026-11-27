/**
 * One writer at a time in a tracker, across processes: the generation lock on the tracker's lock directory, under which any hold journal a
 * cut-short hold left is replayed before the action runs.
 */
import { type HoldFence, type LockTaker, withLockAt } from './GenerationLock.ts';
import { replayHoldJournal }                          from './HoldJournal.ts';
import { localStoreLayoutOf }                         from './LocalStoreLayout.ts';
import type { Workspace }                             from './Workspace.ts';

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
 * A held record is taken over only once the taker judges its holder's process gone, never by its age; an unreadable one is taken over too.
 * Throws `OperationRefusal('unrepaired')` — exit 2 — its detail `tracker-lock-held` when the retry budget runs out.
 */
export function withLock<ActionResult>(
  workspace: Workspace,
  action: (hold: HoldFence) => Promise<ActionResult> | ActionResult,
  now: () => Date,
  taker: LockTaker,
): Promise<ActionResult> {
  return withLockAt(localStoreLayoutOf(workspace).storeLockFolder, replayingTheJournalFirst(workspace, action), now, taker);
}
