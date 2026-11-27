/** The CLI's composition root of the store port: the board of the current directory, reached through the local-files adapter. */
import type { BoardStore, StoreReadFace }   from '../src/services/store/BoardStore.ts';
import { createLocalFilesBoardStore }       from '../src/services/store/LocalFilesBoardStore.ts';
import { lockTakerOf }                      from '../src/services/tracker/LockHolders.ts';
import { requireWorkspace, type Workspace } from '../src/services/tracker/Workspace.ts';
import type { CommandContext }              from './CommandContext.ts';

/** The store of a board whose workspace the command already resolved. */
export function boardStoreIn(context: Pick<CommandContext, 'now' | 'platformPorts' | 'standardError'>, workspace: Workspace): BoardStore {
  const lockTaker = lockTakerOf(context.platformPorts.processSupervision, context.standardError);
  return createLocalFilesBoardStore({ workspace, now: context.now, lockTaker });
}

export function boardStoreOf(context: CommandContext): { workspace: Workspace; store: BoardStore } {
  const workspace = requireWorkspace(context.currentDirectory);
  return { workspace, store: boardStoreIn(context, workspace) };
}

/** The lock-free read side of the current directory's board, for a verb that changes nothing. */
export function boardReadsOf(context: CommandContext): StoreReadFace {
  return boardStoreOf(context).store.reads;
}
