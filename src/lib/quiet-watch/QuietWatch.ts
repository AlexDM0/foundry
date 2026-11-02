/**
 * A best-effort folder watch. A platform that refuses the watch at its start, or fails it later with an `error` event, ends it quietly, and the
 * caller's sweep or timer stays the fallback: a failing watch with no `error` listener would throw out of the process.
 */
import { watch } from 'node:fs';

export interface QuietWatchHandle {
  close: () => void;
}

/** The platform watch as this reads it; Bun's and Node's `fs.watch` satisfy it. */
export type PlatformWatch = (folderPath: string, options: { recursive: boolean }, onEvent: () => void) => QuietWatchHandle & {
  on: (event: 'error', listener: (error: Error) => void) => unknown;
};

export interface QuietWatchRequest {
  folderPath:     string;
  recursive:      boolean;
  onEvent:        () => void;
  /** Overridden by specs, which raise the failures themselves. */
  platformWatch?: PlatformWatch;
}

/** `null` when the platform refuses the watch; a watch that fails after its start closes itself and reports no more events. */
function watchQuietly(request: QuietWatchRequest): QuietWatchHandle | null {
  const platformWatch = request.platformWatch ?? watch;
  try {
    const watcher = platformWatch(request.folderPath, { recursive: request.recursive }, () => request.onEvent());
    watcher.on('error', () => watcher.close());
    return watcher;
  } catch {
    return null;
  }
}

export const QuietWatch = Object.freeze({ watchQuietly });
