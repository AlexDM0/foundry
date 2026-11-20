/** The CLI's composition root of the store port: the board of the current directory, reached through the local-files adapter. */
import type { BoardStore }                  from '../src/services/store/BoardStore.ts';
import { createLocalFilesBoardStore }       from '../src/services/store/LocalFilesBoardStore.ts';
import { requireWorkspace, type Workspace } from '../src/services/tracker/Workspace.ts';
import type { CommandContext }              from './CommandContext.ts';

export function boardStoreOf(context: CommandContext): { workspace: Workspace; store: BoardStore } {
  const workspace = requireWorkspace(context.currentDirectory);
  const store     = createLocalFilesBoardStore({ workspace, now: context.now, lockHolderIsGone: context.platformPorts.processSupervision.processIsGone });
  return { workspace, store };
}
