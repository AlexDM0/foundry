/**
 * The one selector of the `FileReplace` port. The writes that need it sit inside lib packages with no context to take a port from, so
 * `fileReplaceOfThisProcess` reads the platform itself, at call time and never at import.
 */
import { linkSync, renameSync, unlinkSync } from 'node:fs';

import type { FileReplace }                                   from './FileReplace.ts';
import { createPosixFileReplace, type FileReplacePrimitives } from './PosixFileReplace.ts';

export const REAL_FILE_REPLACE_PRIMITIVES: FileReplacePrimitives = Object.freeze({ rename: renameSync, unlink: unlinkSync, link: linkSync });

/** Every platform keeps these moves until it has an adapter of its own: all tracker writes rest on them. */
export function fileReplaceFor(_platform: string): FileReplace {
  return createPosixFileReplace(REAL_FILE_REPLACE_PRIMITIVES);
}

export function fileReplaceOfThisProcess(): FileReplace {
  return fileReplaceFor(process.platform);
}
