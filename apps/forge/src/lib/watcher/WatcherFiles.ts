import { join } from 'node:path';

import { privateFolderOf } from '../talos/TalosFiles.ts';

/** `name` may hold a slash, as a process Watcher's does: that names a subfolder. */
export function watcherSecretPathOf(monitorFolder: string, trackerId: string, name: string, instance: number): string {
  return join(privateFolderOf(monitorFolder, trackerId), `${name}-${instance}.secret`);
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
