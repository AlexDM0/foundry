/**
 * What wakes the DrivePass: a debounced watch of the data folder, its job folders included, and of the Hatch folders, plus a sweep every
 * `OVERSEER_SWEEP_SECONDS` as a backstop for dropped watch events. A wake only asks for a pass; whether anything changed is the pass's
 * fingerprint, never the time of the event.
 */
import { existsSync, mkdirSync } from 'node:fs';
import { join }                  from 'node:path';

import { type PlatformWatch, QuietWatch, type QuietWatchHandle }        from '../../lib/quiet-watch/QuietWatch.ts';
import { OVERSEER_SWEEP_SECONDS, OVERSEER_WATCH_DEBOUNCE_MILLISECONDS } from '../../shared/constants/OverseerLimits.ts';
import { PRODUCT_NAMES }                                                from '../../shared/constants/ProductNames.ts';

const MILLISECONDS_PER_SECOND = 1000;

export interface DataFolderWatchRequest {
  trackerDirectory:   string;
  repositoryRoot:     string;
  wake:               () => void;
  /** Called at each sweep before its wake; the Overseer asks the on-disk binary for its versions again then. */
  onSweep?:           () => void;
  /** Overridden by specs, which cannot wait a sweep. */
  sweepMilliseconds?: number;
  /** Overridden by specs, which drive the file events and failures themselves. */
  platformWatch?:     PlatformWatch;
}

export interface DataFolderWatch {
  /**
   * Adds a watch of one job's Hatch folder, once per folder. Where the recursive watch of the Hatch root already sees it, this is one more
   * wake; where it does not, as with inotify, this is what wakes the pass before the sweep.
   */
  watchHatchFolder: (hatchDirectory: string) => void;
  stop:             () => void;
}

/**
 * The Hatch root holds every job's folder, so one recursive watch sees a request in a folder created after the start where the platform
 * watches recursively. A folder the platform cannot watch, or whose watch fails later, is still swept.
 */
function startWatching(request: DataFolderWatchRequest): DataFolderWatch {
  let debounce: ReturnType<typeof setTimeout> | null = null;
  const wakeSoon = (): void => {
    if (debounce !== null) clearTimeout(debounce);
    debounce = setTimeout(() => {
      debounce = null;
      request.wake();
    }, OVERSEER_WATCH_DEBOUNCE_MILLISECONDS);
  };
  const hatchRoot = join(request.repositoryRoot, PRODUCT_NAMES.WORKTREES_FOLDER, 'hatch');
  if (!existsSync(hatchRoot)) mkdirSync(hatchRoot, { recursive: true });
  const watchFolder = (folderPath: string): QuietWatchHandle | null => QuietWatch.watchQuietly({
    folderPath,
    recursive: true,
    onEvent:   wakeSoon,
    ...(request.platformWatch === undefined ? {} : { platformWatch: request.platformWatch }),
  });
  const watchers = [watchFolder(request.trackerDirectory), watchFolder(hatchRoot)];
  const watchedHatchFolders = new Set<string>();
  const sweepOnce = (): void => {
    request.onSweep?.();
    request.wake();
  };
  const sweep = setInterval(sweepOnce, request.sweepMilliseconds ?? OVERSEER_SWEEP_SECONDS * MILLISECONDS_PER_SECOND);
  let stopped = false;
  return {
    watchHatchFolder: (hatchDirectory) => {
      if (stopped || watchedHatchFolders.has(hatchDirectory)) return;
      watchedHatchFolders.add(hatchDirectory);
      watchers.push(watchFolder(hatchDirectory));
    },
    stop: () => {
      stopped = true;
      if (debounce !== null) clearTimeout(debounce);
      clearInterval(sweep);
      for (const watcher of watchers) watcher?.close();
    },
  };
}

export const DataFolderWatch = Object.freeze({ startWatching });
