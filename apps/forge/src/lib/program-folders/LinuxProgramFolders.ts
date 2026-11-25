import { posix } from 'node:path';

import { newestNodeVersionFoldersOf } from './NewestNodeVersionFolder.ts';
import type { ProgramFolders }        from './ProgramFolders.ts';

const BUN_FOLDER = ['.bun', 'bin'] as const;
const LOCAL_INSTALL_FOLDER = '/usr/local/bin';
/** pipx, uv and the native installers link here. */
const USER_LINK_FOLDER = ['.local', 'bin'] as const;
/** Homebrew's prefix on Linux, then snapd's command links. */
const PACKAGE_MANAGER_FOLDERS = ['/home/linuxbrew/.linuxbrew/bin', '/snap/bin'] as const;
const BASE_FOLDERS = ['/usr/bin', '/bin', '/usr/sbin', '/sbin'] as const;

export const LINUX_PROGRAM_FOLDERS: ProgramFolders = Object.freeze<ProgramFolders>({
  pathModule:       posix,
  installFoldersOf: (homeDirectory) => [
    posix.join(homeDirectory, ...BUN_FOLDER),
    LOCAL_INSTALL_FOLDER,
    posix.join(homeDirectory, ...USER_LINK_FOLDER),
    ...PACKAGE_MANAGER_FOLDERS,
  ],
  nodeVersionFoldersOf: newestNodeVersionFoldersOf,
  baseFolders:          () => BASE_FOLDERS,
  programFileNamesOf:   (programName) => [programName],
});
