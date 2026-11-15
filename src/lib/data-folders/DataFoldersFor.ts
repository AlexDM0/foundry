/** The one selector of the `DataFolders` port; a platform with no adapter keeps the machine's own scratch root and refuses a folder. */
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
  const refuse = (): never => {
    throw new Error(`no data folders exist for the platform ${platform}`);
  };
  return Object.freeze<DataFolders>({
    temporaryRoots:           () => [tmpdir()],
    temporaryFolderOf:        () => null,
    monitorFolderOf:          refuse,
    systemFolder:             refuse,
    pathModule:               path,
    foldsCase:                false,
    executableFolderNames:    ['bin'],
    executableFileExtensions: [],
  });
}
