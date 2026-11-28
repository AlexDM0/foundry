/** The snapshot a job's launch takes for the agent-configuration and ref-moves checks: every ref and detached HEAD, and the hooks folder's digest. */
import type { LaunchSnapshot } from '../../adapters/@types/LaunchSnapshot.ts';

import { CustomsAgentConfigCheck } from './CustomsAgentConfigCheck.ts';
import { CustomsRefMovesCheck }    from './CustomsRefMovesCheck.ts';

/** `null` when git cannot list the refs or the hooks folder cannot be read: the agent-configuration check could not hold that snapshot. */
export function launchSnapshotOf(worktreePath: string): LaunchSnapshot | null {
  const refs = CustomsRefMovesCheck.refsOf(worktreePath);
  const hooksFolderReading = CustomsAgentConfigCheck.hooksFolderReadingOf(worktreePath);
  if (refs === null || hooksFolderReading.verdict === 'unreadable') return null;
  return { refs, hooksFolderDigest: hooksFolderReading.digest };
}
