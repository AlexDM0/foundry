import { posix } from 'node:path';

import { newestNodeVersionFoldersOf } from './NewestNodeVersionFolder.ts';
import type { ProgramFolders }        from './ProgramFolders.ts';

/** Bun's installer, Homebrew on Apple silicon and on Intel, then the native installers' link folder. */
const BUN_FOLDER = ['.bun', 'bin'] as const;
const SYSTEM_INSTALL_FOLDERS = ['/opt/homebrew/bin', '/usr/local/bin'] as const;
const USER_LINK_FOLDER = ['.local', 'bin'] as const;
const BASE_FOLDERS = ['/usr/bin', '/bin', '/usr/sbin', '/sbin'] as const;

export const DARWIN_PROGRAM_FOLDERS: ProgramFolders = Object.freeze<ProgramFolders>({
  pathModule:           posix,
  installFoldersOf:     (homeDirectory) => [posix.join(homeDirectory, ...BUN_FOLDER), ...SYSTEM_INSTALL_FOLDERS, posix.join(homeDirectory, ...USER_LINK_FOLDER)],
  nodeVersionFoldersOf: newestNodeVersionFoldersOf,
  baseFolders:          () => BASE_FOLDERS,
});
