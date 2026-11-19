/**
 * The Watchers' adapter of a board's children for a spec that reads children it did not launch through it: their liveness, event
 * logs and input. It launches nothing; without a tracker it names no job folder, and the spec names the child folders itself.
 */
import type { PlatformPorts }         from '../lib/platform-ports/PlatformPortsFor.ts';
import type { BoardChildren }         from '../services/overseer/BoardChildren.ts';
import { createWatcherBoardChildren } from '../services/overseer/WatcherBoardChildren.ts';

const UNREAD_TRACKER_DIRECTORY = '/example/unread-tracker';

export function watcherChildReadingsWith(platformPorts: PlatformPorts, trackerDirectory: string = UNREAD_TRACKER_DIRECTORY): BoardChildren {
  return createWatcherBoardChildren({
    platformPorts, trackerDirectory, launching: null, log: () => undefined
  });
}
