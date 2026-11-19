/**
 * The Watcher's bundle for the Watcher fleet's own specs, which go with the fleet: a real-system spec pins the bundle into its scratch
 * tracker, and a default spec names a path no recorded stage reads. Test-only.
 */
import { mkdirSync } from 'node:fs';

import { overseerFilesIn }                   from '../services/overseer/OverseerFiles.ts';
import { WATCHER_ENTRY_PATH, WatcherBundle } from '../services/overseer/WatcherBundle.ts';
import type { Workspace }                    from '../services/tracker/Workspace.ts';

export const FAKE_WATCHER_BUNDLE_PATH = '/no-bundle-is-read-by-the-recorded-watcher-stages';

/** The real Watcher's bundle, for a real-system spec; the build lands in the scratch tracker. */
export async function pinnedScratchWatcherBundle(workspace: Workspace): Promise<string> {
  const { overseerDirectory } = overseerFilesIn(workspace.trackerDirectory);
  mkdirSync(overseerDirectory, { recursive: true });
  return await WatcherBundle.pinWatcherBundle({ overseerDirectory, codeVersion: 'code-example', entryPath: WATCHER_ENTRY_PATH });
}
