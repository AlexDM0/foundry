/**
 * Replace a file in one step, so no reader sees a half-written one: write a temporary file beside the target (a rename across filesystems
 * is a copy, and a copy is not atomic), `fsync` it, then rename it over the target. It depends on no other lib package.
 */
import { randomUUID } from 'node:crypto';
import {
  closeSync,
  existsSync,
  fchmodSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readlinkSync,
  realpathSync,
  statSync
} from 'node:fs';
import { dirname, resolve } from 'node:path';

import type { ExclusiveCreation, FileReplace } from './FileReplace.ts';
import { fileReplaceOfThisProcess }            from './FileReplaceFor.ts';
import { writeEveryByte }                      from './WriteEveryByte.ts';

const TEMPORARY_NAME_RANDOM_CHARACTERS = 8;

const PERMISSION_BITS = 0o777;

const OWNER_ONLY_FILE_MODE = 0o600;

const SYMBOLIC_LINK_FOLLOW_LIMIT_HOPS = 40;

function temporaryPathBeside(targetPath: string): string {
  return `${targetPath}.${process.pid}.${randomUUID().slice(0, TEMPORARY_NAME_RANDOM_CHARACTERS)}.tmp`;
}

/** The last path of a symlink chain, which may not exist yet; a chain that never ends throws ELOOP, as a plain write through it would. */
function linkChainEndOf(targetPath: string): string {
  try {
    return realpathSync(targetPath);
  } catch {
    // Dangling, absent or cyclic: the chain is followed by hand below.
  }
  let currentPath = targetPath;
  for (let i = 0; i < SYMBOLIC_LINK_FOLLOW_LIMIT_HOPS; i++) {
    let entryIsASymbolicLink = false;
    try {
      entryIsASymbolicLink = lstatSync(currentPath).isSymbolicLink();
    } catch {
      return currentPath;
    }
    if (!entryIsASymbolicLink) return currentPath;
    // The kernel resolves a relative link against the physical folder holding it, so a `..` after a symlinked folder lands where it would.
    currentPath = resolve(realpathSync(dirname(currentPath)), readlinkSync(currentPath));
  }
  throw Object.assign(new Error(`ELOOP: too many symbolic links encountered, '${targetPath}'`), { code: 'ELOOP' });
}

function replaceFileAtomically(targetPath: string, contents: string | Uint8Array, fileReplace: FileReplace, requiredMode: number | null): void {
  let finalPath = targetPath;
  try {
    finalPath = realpathSync(targetPath);
  } catch {
    // A first write has nothing to resolve.
  }

  let temporaryMode = requiredMode;
  try {
    temporaryMode ??= statSync(finalPath).mode & PERMISSION_BITS;
  } catch {
    // No file, no mode to carry over.
  }

  mkdirSync(dirname(finalPath), { recursive: true });
  const temporaryPath = temporaryPathBeside(finalPath);
  try {
    const temporaryFileDescriptor = openSync(temporaryPath, 'w', temporaryMode ?? undefined);
    try {
      // The mode handed to `open` is masked by the umask; only an explicit `fchmod` carries every bit over.
      if (temporaryMode !== null) fchmodSync(temporaryFileDescriptor, temporaryMode);
      writeEveryByte(temporaryFileDescriptor, contents);
      fsyncSync(temporaryFileDescriptor);
    } finally {
      closeSync(temporaryFileDescriptor);
    }
    const replacement = fileReplace.replaceFile(temporaryPath, finalPath);
    if (replacement.verdict === 'held') throw replacement.failure;
  } catch (error) {
    try {
      fileReplace.removeHeldFile(temporaryPath);
    } catch {
      // The rename may already have consumed the path, and cleaning up must not replace the original error.
    }
    throw error;
  }
}

/**
 * A symlinked target stays a symlink and keeps its mode: the path is `realpath`-resolved first, and
 * an existing file's permission bits are carried onto the replacement.
 */
export function writeFileAtomically(targetPath: string, contents: string, fileReplace: FileReplace = fileReplaceOfThisProcess()): void {
  replaceFileAtomically(targetPath, contents, fileReplace, null);
}

/** The temporary file is created at 0600, so a secret is never readable by others, from its creation through its rename. Bytes are written as they are. */
export function writeOwnerOnlyFileAtomically(targetPath: string, contents: string | Uint8Array, fileReplace: FileReplace = fileReplaceOfThisProcess()): void {
  replaceFileAtomically(targetPath, contents, fileReplace, OWNER_ONLY_FILE_MODE);
}

/**
 * Writes where a possibly dangling link chain ends, so the link survives the rename. Like a plain write
 * through the link, it never creates the folder a dangling link points into (ENOENT) and refuses a cycle (ELOOP).
 */
export function writeFileAtomicallyThroughLinks(linkPath: string, contents: string): void {
  const destinationPath = linkChainEndOf(linkPath);
  if (destinationPath !== linkPath && !existsSync(dirname(destinationPath))) {
    throw Object.assign(new Error(`ENOENT: no such file or directory, open '${linkPath}'`), { code: 'ENOENT' });
  }
  writeFileAtomically(destinationPath, contents);
}

/** Throws what held the file once the port's tries are spent. */
export function removeHeldFile(path: string, fileReplace: FileReplace = fileReplaceOfThisProcess()): void {
  const removal = fileReplace.removeHeldFile(path);
  if (removal.verdict === 'held') throw removal.failure;
}

function createdBesideTemporaryFile(
  targetPath: string,
  contents: string,
  fileReplace: FileReplace,
  moveIntoPlace: (temporaryPath: string) => ExclusiveCreation,
): ExclusiveCreation {
  mkdirSync(dirname(targetPath), { recursive: true });
  const temporaryPath = temporaryPathBeside(targetPath);
  try {
    const temporaryFileDescriptor = openSync(temporaryPath, 'wx');
    try {
      writeEveryByte(temporaryFileDescriptor, contents);
      fsyncSync(temporaryFileDescriptor);
    } finally {
      closeSync(temporaryFileDescriptor);
    }
    return moveIntoPlace(temporaryPath);
  } finally {
    try {
      fileReplace.removeHeldFile(temporaryPath);
    } catch {
      // A temporary file that was never opened has nothing to remove.
    }
  }
}

/**
 * The create-exclusive twin: the complete temporary file is hard-linked into place, which fails rather than replaces when the target exists.
 * Where links fail the target is created by exclusive open instead, so it suits only a file whose reader tolerates a partial one.
 */
export function createFileAtomically(targetPath: string, contents: string, fileReplace: FileReplace = fileReplaceOfThisProcess()): ExclusiveCreation {
  return createdBesideTemporaryFile(targetPath, contents, fileReplace, (temporaryPath) => fileReplace.createExclusively(temporaryPath, targetPath, contents));
}

/** For a file a partial reading would mislead on: a reader sees it whole or absent, and where links fail the link's failure is thrown. */
export function createWholeFileAtomically(targetPath: string, contents: string, fileReplace: FileReplace = fileReplaceOfThisProcess()): ExclusiveCreation {
  return createdBesideTemporaryFile(targetPath, contents, fileReplace, (temporaryPath) => fileReplace.createWholeExclusively(temporaryPath, targetPath));
}
