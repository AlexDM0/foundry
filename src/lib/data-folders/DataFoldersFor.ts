/** The one selector of the `DataFolders` port; a platform with no adapter has no scratch roots, so a process still starts, and refuses a folder. */
import { tmpdir } from 'node:os';
import path       from 'node:path';

import type { DataFolders }       from './DataFolders.ts';
import { createPosixDataFolders } from './PosixDataFolders.ts';

export function dataFoldersFor(platform: string, monitorFolderName: string): DataFolders {
  if (platform === 'darwin' || platform === 'linux') return createPosixDataFolders({ temporaryDirectory: tmpdir, monitorFolderName });
  const refuse = (): never => {
    throw new Error(`no data folders exist for the platform ${platform}`);
  };
  return Object.freeze<DataFolders>({
    temporaryRoots: () => [], monitorFolderOf: refuse, systemFolder: refuse, pathModule: path
  });
}
