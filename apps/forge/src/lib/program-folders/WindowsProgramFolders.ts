import { win32 } from 'node:path';

import type { ProgramFolders } from './ProgramFolders.ts';

/** The machine's folder variables, read at call time by the composition root; Windows names each one per user or per machine. */
export interface WindowsProgramFolderRoots {
  /** `SystemRoot`. */
  readonly systemRoot:                   () => string | undefined;
  /** `LOCALAPPDATA`. */
  readonly localApplicationDataFolder:   () => string | undefined;
  /** `APPDATA`. */
  readonly roamingApplicationDataFolder: () => string | undefined;
  /** `ProgramFiles`. */
  readonly programFilesFolder:           () => string | undefined;
}

const DRIVE_ABSOLUTE_PATH = /^[A-Za-z]:[\\/]/;

/** The native installers' link folder, Bun's installer, then npm's global shims. */
const HOME_INSTALL_FOLDERS = [['.local', 'bin'], ['.bun', 'bin']] as const;
const NPM_FOLDER_UNDER_ROAMING = ['npm'] as const;
/** winget's command links. */
const WINGET_FOLDER_UNDER_LOCAL = ['Microsoft', 'WinGet', 'Links'] as const;
/** Node's installer, where nvm-windows also links its current node, then Git for Windows' commands. */
const FOLDERS_UNDER_PROGRAM_FILES = [['nodejs'], ['Git', 'cmd']] as const;
const BASE_FOLDERS_UNDER_SYSTEM_ROOT = [['System32'], [], ['System32', 'Wbem'], ['System32', 'WindowsPowerShell', 'v1.0']] as const;

/** A root that is not drive-absolute names no folder, so no program is looked for at a guessed path. */
function foldersUnder(root: string | undefined, folderParts: readonly (readonly string[])[]): string[] {
  if (root === undefined || !DRIVE_ABSOLUTE_PATH.test(root)) return [];
  return folderParts.map((parts) => win32.join(root, ...parts));
}

export function createWindowsProgramFolders(roots: WindowsProgramFolderRoots): ProgramFolders {
  return Object.freeze<ProgramFolders>({
    pathModule:       win32,
    installFoldersOf: (homeDirectory) => [
      ...HOME_INSTALL_FOLDERS.map((parts) => win32.join(homeDirectory, ...parts)),
      ...foldersUnder(roots.roamingApplicationDataFolder(), [NPM_FOLDER_UNDER_ROAMING]),
      ...foldersUnder(roots.localApplicationDataFolder(), [WINGET_FOLDER_UNDER_LOCAL]),
      ...foldersUnder(roots.programFilesFolder(), FOLDERS_UNDER_PROGRAM_FILES),
    ],
    nodeVersionFoldersOf: () => [],
    baseFolders:          () => foldersUnder(roots.systemRoot(), BASE_FOLDERS_UNDER_SYSTEM_ROOT),
  });
}
