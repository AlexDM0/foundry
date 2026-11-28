import { chmodSync, mkdirSync, statSync } from 'node:fs';

import type { OwnerOnlyFiles, OwnerOnlyRestriction } from './OwnerOnlyFiles.ts';

export interface OwnerOnlyPrimitives {
  readonly createFolder: (folder: string, mode: number) => void;
  readonly changeMode:   (path: string, mode: number) => void;
  /** Throws for a path that cannot be read. */
  readonly modeOf:       (path: string) => number;
}

const OWNER_ONLY_FOLDER_MODE = 0o700;
const OWNER_ONLY_FILE_MODE   = 0o600;
const GROUP_AND_OTHER_BITS   = 0o077;
/** A mode change that did not throw holds: the mode bits are the whole access rule. */
const RESTRICTED: OwnerOnlyRestriction = Object.freeze({ verdict: 'restricted' });

export const REAL_POSIX_OWNER_ONLY_PRIMITIVES: OwnerOnlyPrimitives = Object.freeze({
  createFolder: (folder: string, mode: number) => {
    mkdirSync(folder, { recursive: true, mode });
  },
  changeMode: chmodSync,
  modeOf:     (path: string) => statSync(path).mode,
});

export function createPosixOwnerOnlyFiles({ createFolder, changeMode, modeOf }: OwnerOnlyPrimitives): OwnerOnlyFiles {
  return Object.freeze<OwnerOnlyFiles>({
    restrictFolder: (folder) => {
      createFolder(folder, OWNER_ONLY_FOLDER_MODE);
      changeMode(folder, OWNER_ONLY_FOLDER_MODE);
      return RESTRICTED;
    },
    restrictFile: (path) => {
      changeMode(path, OWNER_ONLY_FILE_MODE);
      return RESTRICTED;
    },
    isOwnerOnly: (path) => {
      try {
        return (modeOf(path) & GROUP_AND_OTHER_BITS) === 0;
      } catch {
        return false;
      }
    },
  });
}
