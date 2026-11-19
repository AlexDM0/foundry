import { join } from 'node:path';

import { privateFolderOf } from '../../lib/talos/TalosFiles.ts';

export interface OverseerFiles {
  /** `<data>/overseer/`: it holds the Batons, and no secret. */
  overseerDirectory: string;
  /** `<data>/overseer.log`, appended in place. */
  logFilePath:       string;
}

export function overseerFilesIn(trackerDirectory: string): OverseerFiles {
  const overseerDirectory = join(trackerDirectory, 'overseer');
  return {
    overseerDirectory,
    logFilePath: join(trackerDirectory, 'overseer.log'),
  };
}

/** `<data>/jobs/<J>/`: a job's own files, its children's among them. */
export function jobFolderIn(trackerDirectory: string, jobId: string): string {
  return join(trackerDirectory, 'jobs', jobId);
}

/** The API token, in the board's owner-only folder; every reader takes the path from the Baton's `tokenFile`. */
export function overseerTokenPathOf(monitorFolder: string, trackerId: string): string {
  return join(privateFolderOf(monitorFolder, trackerId), 'token');
}
