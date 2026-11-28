/**
 * The one selector of the `FileReplace` port. The writes that need it sit inside lib packages with no context to take a port from, so
 * `fileReplaceOfThisProcess` reads the platform itself, at call time and never at import.
 */
import {
  closeSync,
  fsyncSync,
  linkSync,
  openSync,
  renameSync,
  unlinkSync
} from 'node:fs';

import type { FileReplace }                                            from './FileReplace.ts';
import { createPosixFileReplace }                                      from './PosixFileReplace.ts';
import { createWindowsFileReplace, type WindowsFileReplacePrimitives } from './WindowsFileReplace.ts';
import { writeEveryByte }                                              from './WriteEveryByte.ts';

function createNewFile(path: string, contents: string): void {
  const fileDescriptor = openSync(path, 'wx');
  try {
    try {
      writeEveryByte(fileDescriptor, contents);
      fsyncSync(fileDescriptor);
    } finally {
      closeSync(fileDescriptor);
    }
  } catch (failure) {
    unlinkSync(path);
    throw failure;
  }
}

export const REAL_FILE_REPLACE_PRIMITIVES: WindowsFileReplacePrimitives = Object.freeze({
  rename:    renameSync,
  unlink:    unlinkSync,
  link:      linkSync,
  createNew: createNewFile,
  wait:      (milliseconds: number) => Bun.sleepSync(milliseconds),
});

/** Every platform but Windows keeps the POSIX moves: every caller's writes rest on them. */
export function fileReplaceFor(platform: string): FileReplace {
  return platform === 'win32' ? createWindowsFileReplace(REAL_FILE_REPLACE_PRIMITIVES) : createPosixFileReplace(REAL_FILE_REPLACE_PRIMITIVES);
}

export function fileReplaceOfThisProcess(): FileReplace {
  return fileReplaceFor(process.platform);
}
