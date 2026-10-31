import type { OwnerOnlyFiles } from './OwnerOnlyFiles.ts';

export interface OwnerOnlyPrimitives {
  readonly createFolder: (folder: string, mode: number) => void;
  readonly changeMode:   (path: string, mode: number) => void;
  /** Throws for a path that cannot be read. */
  readonly modeOf:       (path: string) => number;
}

const OWNER_ONLY_FOLDER_MODE = 0o700;
const OWNER_ONLY_FILE_MODE   = 0o600;
const GROUP_AND_OTHER_BITS   = 0o077;

export function createPosixOwnerOnlyFiles({ createFolder, changeMode, modeOf }: OwnerOnlyPrimitives): OwnerOnlyFiles {
  return Object.freeze<OwnerOnlyFiles>({
    restrictFolder: (folder) => {
      createFolder(folder, OWNER_ONLY_FOLDER_MODE);
      changeMode(folder, OWNER_ONLY_FOLDER_MODE);
    },
    restrictFile: (path) => changeMode(path, OWNER_ONLY_FILE_MODE),
    isOwnerOnly:  (path) => {
      try {
        return (modeOf(path) & GROUP_AND_OTHER_BITS) === 0;
      } catch {
        return false;
      }
    },
  });
}
