/**
 * Windows: the POSIX moves, with a rename and an unlink retried while something holds the file, since one MoveFileExW has no retry of its own.
 * The budget is a count of tries, linear from one step as SQLite's is, and its waits stay far under the stale window of a caller's lock.
 */
import type { FileReplace }                                   from './FileReplace.ts';
import { failureMeansTheFileIsHeld }                          from './HeldFileFailure.ts';
import { createPosixFileReplace, type FileReplacePrimitives } from './PosixFileReplace.ts';

export const HELD_FILE_RETRY_TRIES             = 12;
export const HELD_FILE_RETRY_STEP_MILLISECONDS = 25;

export interface WindowsFileReplacePrimitives extends FileReplacePrimitives {
  readonly wait: (milliseconds: number) => void;
}

function retriedWhileHeld<Paths extends string[]>(move: (...paths: Paths) => void, wait: (milliseconds: number) => void): (...paths: Paths) => void {
  return (...paths) => {
    for (let i = 1; i < HELD_FILE_RETRY_TRIES; i++) {
      try {
        move(...paths);
        return;
      } catch (failure) {
        if (!failureMeansTheFileIsHeld(failure)) throw failure;
        wait(i * HELD_FILE_RETRY_STEP_MILLISECONDS);
      }
    }
    move(...paths);
  };
}

export function createWindowsFileReplace({ wait, ...primitives }: WindowsFileReplacePrimitives): FileReplace {
  return createPosixFileReplace({
    ...primitives,
    rename: retriedWhileHeld(primitives.rename, wait),
    unlink: retriedWhileHeld(primitives.unlink, wait),
  });
}
