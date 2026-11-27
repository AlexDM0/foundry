import { writeFileAtomically }          from '../../lib/atomic-file/AtomicFile.ts';
import type { WorktreeCreationFailure } from './@types/WorktreeCreationFailure.ts';
import { WorktreeFailureWording }       from './WorktreeFailureWording.ts';

/** The stored file is the failure's sentence on one line, for a person to read; only its presence is read back. */
export function createWorktreeFailureWriter(worktreeFailureFilePath: string): { write(failure: WorktreeCreationFailure): void } {
  function write(failure: WorktreeCreationFailure): void {
    writeFileAtomically(worktreeFailureFilePath, `${WorktreeFailureWording.sentenceOf(failure)}\n`);
  }
  return { write };
}
