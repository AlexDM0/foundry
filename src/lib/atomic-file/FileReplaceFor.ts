/**
 * The one selector of the `FileReplace` port. The writes that need it sit inside lib packages with no context to take a port from, so
 * `fileReplaceOfThisProcess` reads the platform itself, at call time and never at import.
 */
import { linkSync, renameSync, unlinkSync } from 'node:fs';

import type { FileReplace }                                   from './FileReplace.ts';
import { createPosixFileReplace, type FileReplacePrimitives } from './PosixFileReplace.ts';

export const REAL_FILE_REPLACE_PRIMITIVES: FileReplacePrimitives = Object.freeze({ rename: renameSync, unlink: unlinkSync, link: linkSync });

export function fileReplaceFor(platform: string): FileReplace {
  if (platform === 'darwin' || platform === 'linux') return createPosixFileReplace(REAL_FILE_REPLACE_PRIMITIVES);
  const refuse = (): never => {
    throw new Error(`no file replace exists for the platform ${platform}`);
  };
  return Object.freeze<FileReplace>({ replaceFile: refuse, removeHeldFile: refuse, createExclusively: refuse });
}

export function fileReplaceOfThisProcess(): FileReplace {
  return fileReplaceFor(process.platform);
}
