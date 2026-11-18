/**
 * Where Talos and the endpoints keep their files. The `src/lib/talos` package depends on `src/lib/atomic-file`, `src/lib/json-record`,
 * `src/lib/owner-only-files` and `src/lib/process-identity`.
 */
import { join } from 'node:path';

import { PRIVATE_FOLDER_NAME, TALOS_FOLDER_NAME } from './constants/TalosProtocol.ts';

export interface ChildFiles { recordPath: string; eventLogPath: string; standardErrorPath: string }

export function talosFolderOf(boardFolder: string): string {
  return join(boardFolder, TALOS_FOLDER_NAME);
}

export function startFilePathOf(boardFolder: string, startNumber: number): string {
  return join(talosFolderOf(boardFolder), `start-${startNumber}.json`);
}

export function talosRecordPathOf(boardFolder: string, startNumber: number): string {
  return join(talosFolderOf(boardFolder), `talos-${startNumber}.json`);
}

export function talosLogPathOf(boardFolder: string, startNumber: number): string {
  return join(talosFolderOf(boardFolder), `talos-${startNumber}.log`);
}

export function launchRegistryPathOf(boardFolder: string, startNumber: number): string {
  return join(talosFolderOf(boardFolder), `launches-${startNumber}.ndjson`);
}

/** `childFolder` is `/`-separated and relative to the board folder, as a launch names it. */
export function childFilesOf(boardFolder: string, childFolder: string, instance: number): ChildFiles {
  const folder = join(boardFolder, ...childFolder.split('/'));
  return {
    recordPath:        join(folder, `child-${instance}.json`),
    eventLogPath:      join(folder, `events-${instance}.ndjson`),
    standardErrorPath: join(folder, `child-${instance}.log`),
  };
}

/** The monitor folder is in the user's profile on every OS. */
export function privateFolderOf(monitorFolder: string, trackerId: string): string {
  return join(monitorFolder, PRIVATE_FOLDER_NAME, trackerId);
}

export function talosSecretPathOf(monitorFolder: string, trackerId: string, startNumber: number): string {
  return join(privateFolderOf(monitorFolder, trackerId), `talos-${startNumber}.secret`);
}
