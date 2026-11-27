import { posix } from 'node:path';

import type { DataFolders } from './DataFolders.ts';

export interface DataFolderPrimitives {
  /** `node:os`'s `tmpdir()`. */
  readonly temporaryDirectory: () => string;
  readonly monitorFolderName:  string;
  /** True on macOS, whose default file system compares names without case; false on Linux. */
  readonly foldsCase:          boolean;
}

const EXECUTABLE_FOLDER_NAMES = ['bin'] as const;

/** Beside `tmpdir()`, which on macOS is a per-user folder under `/var/folders`; programs keep scratch files under `/tmp`. */
const TEMPORARY_FOLDERS_OF_EVERY_UNIX_MACHINE = ['/tmp', '/var/tmp'] as const;
const TEMPORARY_VARIABLE = 'TMPDIR';
const SYSTEM_FOLDER = '/usr/bin';

export function createPosixDataFolders({ temporaryDirectory, monitorFolderName, foldsCase }: DataFolderPrimitives): DataFolders {
  return Object.freeze<DataFolders>({
    temporaryRoots:           () => [temporaryDirectory(), ...TEMPORARY_FOLDERS_OF_EVERY_UNIX_MACHINE],
    temporaryFolderOf:        (environment) => (Object.hasOwn(environment, TEMPORARY_VARIABLE) ? environment[TEMPORARY_VARIABLE] ?? null : null),
    monitorFolderOf:          (home) => posix.join(home, monitorFolderName),
    systemFolder:             () => ({ verdict: 'found', folder: SYSTEM_FOLDER }),
    pathModule:               posix,
    foldsCase,
    executableFolderNames:    EXECUTABLE_FOLDER_NAMES,
    executableFileExtensions: [],
  });
}
