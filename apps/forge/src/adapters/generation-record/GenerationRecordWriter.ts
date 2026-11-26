import { createFileAtomically }                                    from '../../lib/atomic-file/AtomicFile.ts';
import type { ExclusiveCreation, FileReplace }                     from '../../lib/atomic-file/FileReplace.ts';
import { JsonTextUtil }                                            from '../../shared/utils/JsonTextUtil.ts';
import { GENERATION_RECORD_FORMAT_VERSION, type GenerationRecord } from './GenerationRecordIngestion.ts';

/** Each generation is created exclusively and never rewritten, so no step replaces a record another process may have just written. */
export function createGenerationRecordWriter(generationFilePath: string, fileReplace?: FileReplace): {
  create(record: GenerationRecord): ExclusiveCreation;
} {
  return { create: (record) => createFileAtomically(generationFilePath, JsonTextUtil.storedFileTextOf({ version: GENERATION_RECORD_FORMAT_VERSION, ...record }), fileReplace), };
}
