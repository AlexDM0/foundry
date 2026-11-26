/**
 * `instructions-<instance>.json`, the path and content hash of each instruction file a job's child instance was given, kept for the
 * record. Nothing in forge reads it back, so the format has a writer and no ingestion class.
 */
import { writeFileAtomically } from '../../lib/atomic-file/AtomicFile.ts';
import { JsonTextUtil }        from '../../shared/utils/JsonTextUtil.ts';

export const INSTRUCTIONS_READ_FORMAT_VERSION = 1;

/** The file's path and the first hex digits of its content's SHA-256, as the session's launch read it. */
export interface InstructionFileReadRecord {
  path:        string;
  contentHash: string;
}

export function createInstructionsReadWriter(instructionsReadFilePath: string): { write(files: readonly Readonly<InstructionFileReadRecord>[]): void } {
  function write(files: readonly Readonly<InstructionFileReadRecord>[]): void {
    const storedFiles = files.map((file) => ({ path: file.path, contentHash: file.contentHash }));
    writeFileAtomically(instructionsReadFilePath, JsonTextUtil.storedFileTextOf({ version: INSTRUCTIONS_READ_FORMAT_VERSION, files: storedFiles }));
  }

  return { write };
}
