import { win32 } from 'node:path';

import type { DataFolders, SystemFolderAnswer } from './DataFolders.ts';

export interface WindowsDataFolderPrimitives {
  /** `node:os`'s `tmpdir()`, which reads `TEMP` and `TMP`. */
  readonly temporaryDirectory: () => string;
  readonly monitorFolderName:  string;
  /** Windows' `SystemRoot`, read at call time by the composition root. */
  readonly systemRoot:         () => string | undefined;
}

const TEMPORARY_VARIABLE = 'TEMP';
const SYSTEM_FOLDER_NAME = 'System32';
const DRIVE_ABSOLUTE_PATH = /^[A-Za-z]:[\\/]/;
/** `bin` for most tool chains, `Scripts` for a Python environment's entry points. */
const EXECUTABLE_FOLDER_NAMES = ['bin', 'Scripts'] as const;
const EXECUTABLE_FILE_EXTENSIONS = ['.exe', '.cmd', '.bat', '.ps1'] as const;

/** Under `SystemRoot`, so a Windows installed off `C:` is found; with none that is drive-absolute, no program is run by a guessed path. */
function systemFolderUnder(systemRoot: string | undefined): SystemFolderAnswer {
  if (systemRoot === undefined || !DRIVE_ABSOLUTE_PATH.test(systemRoot)) return { verdict: 'refused', cause: 'no-drive-absolute-system-root' };
  return { verdict: 'found', folder: win32.join(systemRoot, SYSTEM_FOLDER_NAME) };
}

export function createWindowsDataFolders({ temporaryDirectory, monitorFolderName, systemRoot }: WindowsDataFolderPrimitives): DataFolders {
  return Object.freeze<DataFolders>({
    temporaryRoots:           () => [temporaryDirectory()],
    temporaryFolderOf:        (environment) => Object.entries(environment).find(([name]) => name.toUpperCase() === TEMPORARY_VARIABLE)?.[1] ?? null,
    monitorFolderOf:          (home) => win32.join(home, monitorFolderName),
    systemFolder:             () => systemFolderUnder(systemRoot()),
    pathModule:               win32,
    foldsCase:                true,
    executableFolderNames:    EXECUTABLE_FOLDER_NAMES,
    executableFileExtensions: EXECUTABLE_FILE_EXTENSIONS,
  });
}
