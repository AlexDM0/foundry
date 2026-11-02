import { win32 } from 'node:path';

import type { DataFolders } from './DataFolders.ts';

export interface WindowsDataFolderPrimitives {
  /** `node:os`'s `tmpdir()`, which reads `TEMP` and `TMP`. */
  readonly temporaryDirectory: () => string;
  readonly monitorFolderName:  string;
}

const TEMPORARY_VARIABLE = 'TEMP';
const SYSTEM_FOLDER = 'C:\\Windows\\System32';
/** `bin` for most tool chains, `Scripts` for a Python environment's entry points. */
const EXECUTABLE_FOLDER_NAMES = ['bin', 'Scripts'] as const;
const EXECUTABLE_FILE_EXTENSIONS = ['.exe', '.cmd', '.bat', '.ps1'] as const;

export function createWindowsDataFolders({ temporaryDirectory, monitorFolderName }: WindowsDataFolderPrimitives): DataFolders {
  return Object.freeze<DataFolders>({
    temporaryRoots:           () => [temporaryDirectory()],
    temporaryFolderOf:        (environment) => Object.entries(environment).find(([name]) => name.toUpperCase() === TEMPORARY_VARIABLE)?.[1] ?? null,
    monitorFolderOf:          (home) => win32.join(home, monitorFolderName),
    systemFolder:             () => SYSTEM_FOLDER,
    pathModule:               win32,
    foldsCase:                true,
    executableFolderNames:    EXECUTABLE_FOLDER_NAMES,
    executableFileExtensions: EXECUTABLE_FILE_EXTENSIONS,
  });
}
