/**
 * Where Talos and the endpoints keep their files. The `src/lib/talos` package depends on `src/lib/atomic-file` and
 * `src/lib/owner-only-files`.
 */
import { join } from 'node:path';

/** The folder of the monitor folder that holds every socket, the API token and every secret; the worker profiles deny it as a whole. */
export const PRIVATE_FOLDER_NAME = 'private';

/** The monitor folder is in the user's profile on every OS. */
export function privateFolderOf(monitorFolder: string, trackerId: string): string {
  return join(monitorFolder, PRIVATE_FOLDER_NAME, trackerId);
}
