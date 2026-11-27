import { createWholeFileAtomically }                               from '../../lib/atomic-file/AtomicFile.ts';
import type { ExclusiveCreation, FileReplace }                     from '../../lib/atomic-file/FileReplace.ts';
import { JsonTextUtil }                                            from '../../shared/utils/JsonTextUtil.ts';
import { GENERATION_RECORD_FORMAT_VERSION, type GenerationRecord } from './GenerationRecordIngestion.ts';

/**
 * Each generation is created exclusively and never rewritten, so no step replaces a record another process may have just written. It is
 * created whole, since a partial record reads as stale and would hand the lock to a second holder; where hard links fail it throws.
 */
export function createGenerationRecordWriter(generationFilePath: string, fileReplace?: FileReplace): {
  create(record: GenerationRecord): ExclusiveCreation;
} {
  const recordTextOf = (record: GenerationRecord): string => JsonTextUtil.storedFileTextOf({ version: GENERATION_RECORD_FORMAT_VERSION, ...record });
  return { create: (record) => createWholeFileAtomically(generationFilePath, recordTextOf(record), fileReplace) };
}
