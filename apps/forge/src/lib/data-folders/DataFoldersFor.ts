/**
 * The one selector of the `DataFolders` port. A platform with no adapter keeps the machine's own scratch root and the monitor folder under the
 * home folder, which no platform rule decides, so a process starts; it refuses the system folder.
 */
import { tmpdir } from 'node:os';
import path       from 'node:path';

import type { DataFolders }         from './DataFolders.ts';
import { createPosixDataFolders }   from './PosixDataFolders.ts';
import { createWindowsDataFolders } from './WindowsDataFolders.ts';

/** `systemRoot` is Windows' `SystemRoot`, read only there. */
export function dataFoldersFor(platform: string, monitorFolderName: string, systemRoot: () => string | undefined = () => undefined): DataFolders {
  if (platform === 'darwin' || platform === 'linux') {
    return createPosixDataFolders({ temporaryDirectory: tmpdir, monitorFolderName, foldsCase: platform === 'darwin' });
  }
  if (platform === 'win32') return createWindowsDataFolders({ temporaryDirectory: tmpdir, monitorFolderName, systemRoot });
  return Object.freeze<DataFolders>({
    temporaryRoots:           () => [tmpdir()],
    temporaryFolderOf:        () => null,
    monitorFolderOf:          (home) => path.join(home, monitorFolderName),
    systemFolder:             () => ({ verdict: 'refused', cause: 'no-adapter' }),
    pathModule:               path,
    foldsCase:                false,
    executableFolderNames:    ['bin'],
    executableFileExtensions: [],
  });
}
