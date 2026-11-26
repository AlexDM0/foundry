import { createWholeFileAtomically }                                 from '../../lib/atomic-file/AtomicFile.ts';
import type { ExclusiveCreation, FileReplace }                       from '../../lib/atomic-file/FileReplace.ts';
import { fileReplaceOfThisProcess }                                  from '../../lib/atomic-file/FileReplaceFor.ts';
import { JsonTextUtil }                                              from '../../shared/utils/JsonTextUtil.ts';
import { HEPHAESTUS_LOCK_FORMAT_VERSION, type HephaestusLockRecord } from './HephaestusLockIngestion.ts';

/** Created whole and exclusively, never rewritten: a partial record would hand the lock to a second Hephaestus. Throws where it cannot be. */
export function createHephaestusLockWriter(hephaestusLockFilePath: string, fileReplace: FileReplace = fileReplaceOfThisProcess()): {
  createWhole(record: HephaestusLockRecord): ExclusiveCreation;
} {
  function createWhole(record: HephaestusLockRecord): ExclusiveCreation {
    return createWholeFileAtomically(hephaestusLockFilePath, JsonTextUtil.storedFileTextOf({ version: HEPHAESTUS_LOCK_FORMAT_VERSION, ...record }), fileReplace);
  }

  return { createWhole };
}
