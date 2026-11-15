import { join } from 'node:path';

import { WATCHER_FOLDER_NAME } from './constants/WatcherProtocol.ts';

/** The monitor folder is in the user's profile on every OS, and the worker profiles deny its Watcher folder as a whole. */
export function ownerOnlyFolderOf(monitorFolder: string, trackerId: string): string {
  return join(monitorFolder, WATCHER_FOLDER_NAME, trackerId);
}

/** `name` may hold a slash, as a process Watcher's does: that names a subfolder. */
export function watcherSecretPathOf(monitorFolder: string, trackerId: string, name: string, instance: number): string {
  return join(ownerOnlyFolderOf(monitorFolder, trackerId), `${name}-${instance}.secret`);
}

/** Every file one Watcher instance reads or writes, all inside its job folder. */
export interface WatcherFiles {
  readonly watcherRecordPath: string;
  readonly launchPath:        string;
  readonly eventLogPath:      string;
  readonly watcherLogPath:    string;
}

export function watcherFilesOf(jobFolder: string, instance: number): WatcherFiles {
  return {
    watcherRecordPath: join(jobFolder, `watcher-${instance}.json`),
    launchPath:        join(jobFolder, `launch-${instance}.json`),
    eventLogPath:      join(jobFolder, `events-${instance}.ndjson`),
    watcherLogPath:    join(jobFolder, `watcher-${instance}.log`),
  };
}
