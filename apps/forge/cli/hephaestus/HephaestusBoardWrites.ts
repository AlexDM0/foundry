/** The Hephaestus process's own board records: one transaction of the store, then the registry; no nudge, since the writer is Hephaestus itself. */
import { LocalTimeUtil }          from '../../src/lib/local-time/LocalTimeUtil.ts';
import type { BoardStore }        from '../../src/services/store/BoardStore.ts';
import type { BoardTransaction }  from '../../src/services/tracker/BoardTransaction.ts';
import type { Workspace }         from '../../src/services/tracker/Workspace.ts';
import type { CommandContext }    from '../CommandContext.ts';
import { registerWrittenTracker } from '../RegisterWrittenTracker.ts';
import { OutputUtil }             from '../utils/OutputUtil.ts';

export async function writeAsHephaestus<Result>(
  store: BoardStore,
  context: CommandContext,
  workspace: Workspace,
  mutate: (transaction: BoardTransaction) => Result,
): Promise<Result> {
  const written = await store.transactions.transact({ at: LocalTimeUtil.formatLocalIso(context.now()), mutate });
  OutputUtil.reportIgnoredTicketFiles(context, written.unreadableRecords.tickets);
  OutputUtil.reportIgnoredEpicFiles(context, written.unreadableRecords.epics);
  await registerWrittenTracker(context, workspace);
  return written.result;
}
