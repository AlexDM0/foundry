import { win32 } from 'node:path';

import type { DataFolders } from './DataFolders.ts';

export interface WindowsDataFolderPrimitives {
  /** `node:os`'s `tmpdir()`, which reads `TEMP` and `TMP`. */
  readonly temporaryDirectory: () => string;
  readonly monitorFolderName:  string;
}

const TEMPORARY_VARIABLE = 'TEMP';
const SYSTEM_FOLDER = 'C:\\Windows\\System32';

export function createWindowsDataFolders({ temporaryDirectory, monitorFolderName }: WindowsDataFolderPrimitives): DataFolders {
  return Object.freeze<DataFolders>({
    temporaryRoots:    () => [temporaryDirectory()],
    temporaryFolderOf: (environment) => Object.entries(environment).find(([name]) => name.toUpperCase() === TEMPORARY_VARIABLE)?.[1] ?? null,
    monitorFolderOf:   (home) => win32.join(home, monitorFolderName),
    systemFolder:      () => SYSTEM_FOLDER,
    pathModule:        win32,
  });
}
