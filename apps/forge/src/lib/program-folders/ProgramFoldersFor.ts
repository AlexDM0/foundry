/** The one selector of the `ProgramFolders` port; a platform with no adapter knows no folder, so a program is found there only at a given path. */
import { posix } from 'node:path';

import { DARWIN_PROGRAM_FOLDERS }                                      from './DarwinProgramFolders.ts';
import { LINUX_PROGRAM_FOLDERS }                                       from './LinuxProgramFolders.ts';
import type { ProgramFolders }                                         from './ProgramFolders.ts';
import { createWindowsProgramFolders, type WindowsProgramFolderRoots } from './WindowsProgramFolders.ts';

const NO_FOLDERS: ProgramFolders = Object.freeze<ProgramFolders>({
  pathModule:           posix,
  installFoldersOf:     () => [],
  nodeVersionFoldersOf: () => [],
  baseFolders:          () => [],
  programFileNamesOf:   (programName) => [programName],
});

/** `windowsRoots` are read only on Windows. */
export function programFoldersFor(platform: string, windowsRoots: WindowsProgramFolderRoots): ProgramFolders {
  if (platform === 'darwin') return DARWIN_PROGRAM_FOLDERS;
  if (platform === 'linux') return LINUX_PROGRAM_FOLDERS;
  return platform === 'win32' ? createWindowsProgramFolders(windowsRoots) : NO_FOLDERS;
}
