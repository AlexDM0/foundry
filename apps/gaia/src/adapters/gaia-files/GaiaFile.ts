/**
 * Writing and removing one of Gaia's own files: its folder is made first, the write is atomic, and every outcome is a verdict. JSON is
 * written indented with a closing newline.
 */
import { mkdir, rm } from 'node:fs/promises';
import { dirname }   from 'node:path';

import { AtomicFile, type AtomicWriteVerdict } from '../../lib/atomic-file/AtomicFile.ts';

export type FileRemoveVerdict =
  | { readonly verdict: 'removed' }
  | { readonly verdict: 'absent' }
  | { readonly verdict: 'unremovable'; readonly failure: string };

export interface GaiaFileWriteOptions {
  /** Applies only to folders this write makes; an existing folder keeps its mode. */
  readonly folderMode?: number;
  /** The file's exact permission bits, which the umask does not narrow. */
  readonly fileMode?:   number;
}

async function writeText(targetPath: string, contents: string, options: GaiaFileWriteOptions = {}): Promise<AtomicWriteVerdict> {
  try {
    await mkdir(dirname(targetPath), options.folderMode === undefined ? { recursive: true } : { recursive: true, mode: options.folderMode });
  } catch (error) {
    return { verdict: 'unwritable', failure: AtomicFile.failureOf(error) };
  }
  return AtomicFile.write(targetPath, contents, options.fileMode === undefined ? {} : { mode: options.fileMode });
}

/** `folderMode` applies only to folders this call makes; an existing folder keeps its mode. */
async function writeJson(targetPath: string, value: unknown, folderMode?: number): Promise<AtomicWriteVerdict> {
  return writeText(targetPath, `${JSON.stringify(value, null, 2)}\n`, folderMode === undefined ? {} : { folderMode });
}

async function remove(targetPath: string): Promise<FileRemoveVerdict> {
  try {
    await rm(targetPath);
    return { verdict: 'removed' };
  } catch (error) {
    const failure = AtomicFile.failureOf(error);
    return failure === 'ENOENT' ? { verdict: 'absent' } : { verdict: 'unremovable', failure };
  }
}

export const GaiaFile = {
  writeText,
  writeJson,
  remove,
} as const;
