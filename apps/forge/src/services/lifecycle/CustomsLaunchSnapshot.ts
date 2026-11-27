/** The snapshot a job's launch takes for V13 and V14: every ref and detached HEAD, and the hooks folder's digest. */
import type { LaunchSnapshot } from '../../adapters/@types/LaunchSnapshot.ts';

import { hooksFolderReadingOf } from './CustomsAgentConfigCheck.ts';
import { refsOf }               from './CustomsRefMovesCheck.ts';

/** `null` when git cannot list the refs or the hooks folder cannot be read, so no snapshot is taken that V13 could not hold. */
export function launchSnapshotOf(worktreePath: string): LaunchSnapshot | null {
  const refs = refsOf(worktreePath);
  const hooksFolderReading = hooksFolderReadingOf(worktreePath);
  if (refs === null || hooksFolderReading.verdict === 'unreadable') return null;
  return { refs, hooksFolderDigest: hooksFolderReading.digest };
}
