import { writeFileAtomically }      from '../../lib/atomic-file/AtomicFile.ts';
import { JsonTextUtil }             from '../../shared/utils/JsonTextUtil.ts';
import { SEEN_HEAD_FORMAT_VERSION } from './SeenHeadIngestion.ts';

export function createSeenHeadWriter(seenHeadFilePath: string): { write(contentHash: string | null): void } {
  function write(contentHash: string | null): void {
    writeFileAtomically(seenHeadFilePath, JsonTextUtil.storedFileTextOf({ version: SEEN_HEAD_FORMAT_VERSION, contentHash }));
  }
  return { write };
}
