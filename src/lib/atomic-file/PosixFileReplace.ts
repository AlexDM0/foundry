/** macOS and Linux: one rename, one unlink, and a hard link for the exclusive create, since a link fails when its target exists. */
import type { FileReplace } from './FileReplace.ts';

export interface FileReplacePrimitives {
  readonly rename: (fromPath: string, toPath: string) => void;
  readonly unlink: (path: string) => void;
  readonly link:   (existingPath: string, newPath: string) => void;
}

export function createPosixFileReplace({ rename, unlink, link }: FileReplacePrimitives): FileReplace {
  return Object.freeze<FileReplace>({
    replaceFile:       (temporaryPath, targetPath) => rename(temporaryPath, targetPath),
    removeHeldFile:    (path) => unlink(path),
    createExclusively: (temporaryPath, targetPath) => {
      try {
        link(temporaryPath, targetPath);
        return 'created';
      } catch (error) {
        if (error instanceof Error && 'code' in error && error.code === 'EEXIST') return 'already-exists';
        throw error;
      }
    },
  });
}
