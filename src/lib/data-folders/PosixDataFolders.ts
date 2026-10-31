import { posix } from 'node:path';

import type { DataFolders } from './DataFolders.ts';

export interface DataFolderPrimitives {
  /** `node:os`'s `tmpdir()`. */
  readonly temporaryDirectory: () => string;
  readonly monitorFolderName:  string;
}

/** Beside `tmpdir()`, which on macOS is a per-user folder under `/var/folders`; Claude Code keeps its scratchpads under `/tmp`. */
const TEMPORARY_FOLDERS_OF_EVERY_UNIX_MACHINE = ['/tmp', '/var/tmp'] as const;
const TEMPORARY_VARIABLE = 'TMPDIR';
const SYSTEM_FOLDER = '/usr/bin';

export function createPosixDataFolders({ temporaryDirectory, monitorFolderName }: DataFolderPrimitives): DataFolders {
  return Object.freeze<DataFolders>({
    temporaryRoots:    () => [temporaryDirectory(), ...TEMPORARY_FOLDERS_OF_EVERY_UNIX_MACHINE],
    temporaryFolderOf: (environment) => (Object.hasOwn(environment, TEMPORARY_VARIABLE) ? environment[TEMPORARY_VARIABLE] ?? null : null),
    monitorFolderOf:   (home) => posix.join(home, monitorFolderName),
    systemFolder:      () => SYSTEM_FOLDER,
    pathModule:        posix,
  });
}
