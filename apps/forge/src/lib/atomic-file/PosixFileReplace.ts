/** macOS and Linux: one rename, one unlink, and a hard link for the exclusive create, since a link fails when its target exists. */
import type { ExclusiveCreation, FileReplace, HeldFileMove } from './FileReplace.ts';
import { errorCodeOf, failureMeansTheFileIsHeld }            from './HeldFileFailure.ts';

export interface FileReplacePrimitives {
  readonly rename:    (fromPath: string, toPath: string) => void;
  readonly unlink:    (path: string) => void;
  readonly link:      (existingPath: string, newPath: string) => void;
  /** Exclusive open, write, flush; throws EEXIST when the path is there. */
  readonly createNew: (path: string, contents: string) => void;
}

function heldFileMoveOf(move: () => void): HeldFileMove {
  try {
    move();
    return { verdict: 'moved' };
  } catch (failure) {
    if (failureMeansTheFileIsHeld(failure)) return { verdict: 'held', failure };
    throw failure;
  }
}

function exclusiveCreationOf(create: () => void, whenTheCreateFails: (failure: unknown) => ExclusiveCreation): ExclusiveCreation {
  try {
    create();
    return 'created';
  } catch (failure) {
    return errorCodeOf(failure) === 'EEXIST' ? 'already-exists' : whenTheCreateFails(failure);
  }
}

function rethrown(failure: unknown): never {
  throw failure;
}

export function createPosixFileReplace({
  rename, unlink, link, createNew
}: FileReplacePrimitives): FileReplace {
  return Object.freeze<FileReplace>({
    replaceFile:            (temporaryPath, targetPath) => heldFileMoveOf(() => rename(temporaryPath, targetPath)),
    removeHeldFile:         (path) => heldFileMoveOf(() => unlink(path)),
    createWholeExclusively: (temporaryPath, targetPath) => exclusiveCreationOf(() => link(temporaryPath, targetPath), rethrown),
    createExclusively:      (temporaryPath, targetPath, contents) => exclusiveCreationOf(
      () => link(temporaryPath, targetPath),
      () => exclusiveCreationOf(() => createNew(targetPath, contents), rethrown),
    ),
  });
}
