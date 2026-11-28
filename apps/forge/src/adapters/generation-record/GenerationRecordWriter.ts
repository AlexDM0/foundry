import { createFileAtomically }                                    from '../../lib/atomic-file/AtomicFile.ts';
import type { ExclusiveCreation, FileReplace }                     from '../../lib/atomic-file/FileReplace.ts';
import { JsonTextUtil }                                            from '../../shared/utils/JsonTextUtil.ts';
import { GENERATION_RECORD_FORMAT_VERSION, type GenerationRecord } from './GenerationRecordIngestion.ts';

/**
 * Each generation is created exclusively and never rewritten, so no step replaces a record another process may have just written. Where
 * hard links fail it is created by exclusive open instead, so a release still lands there and no held generation is stranded.
 */
export function createGenerationRecordWriter(generationFilePath: string, fileReplace?: FileReplace): {
  create(record: GenerationRecord): ExclusiveCreation;
} {
  const recordTextOf = (record: GenerationRecord): string => JsonTextUtil.storedFileTextOf({ version: GENERATION_RECORD_FORMAT_VERSION, ...record });
  return { create: (record) => createFileAtomically(generationFilePath, recordTextOf(record), fileReplace) };
}
