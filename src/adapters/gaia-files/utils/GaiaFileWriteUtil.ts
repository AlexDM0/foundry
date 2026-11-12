/** Writing and removing one of Gaia's own JSON files: its folder is made first, the write is atomic, and every outcome is a verdict. */
import { mkdir, rm } from 'node:fs/promises';
import { dirname }   from 'node:path';

import { AtomicFile, type AtomicWriteVerdict } from '../../../lib/atomic-file/AtomicFile.ts';

export type FileRemoveVerdict =
  | { readonly verdict: 'removed' }
  | { readonly verdict: 'absent' }
  | { readonly verdict: 'unremovable'; readonly failure: string };

function failureOf(error: unknown): string {
  if (error instanceof Error) return (error as NodeJS.ErrnoException).code ?? error.message;
  return String(error);
}

/** `folderMode` applies only to folders this call makes; an existing folder keeps its mode. */
async function writeJson(targetPath: string, value: unknown, folderMode?: number): Promise<AtomicWriteVerdict> {
  try {
    await mkdir(dirname(targetPath), folderMode === undefined ? { recursive: true } : { recursive: true, mode: folderMode });
  } catch (error) {
    return { verdict: 'unwritable', failure: failureOf(error) };
  }
  return AtomicFile.write(targetPath, `${JSON.stringify(value, null, 2)}\n`);
}

async function remove(targetPath: string): Promise<FileRemoveVerdict> {
  try {
    await rm(targetPath);
    return { verdict: 'removed' };
  } catch (error) {
    const failure = failureOf(error);
    return failure === 'ENOENT' ? { verdict: 'absent' } : { verdict: 'unremovable', failure };
  }
}

export const GaiaFileWriteUtil = {
  writeJson,
  remove,
} as const;
