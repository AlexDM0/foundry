import { writeFileAtomically }                      from '../../lib/atomic-file/AtomicFile.ts';
import { JsonTextUtil }                             from '../../shared/utils/JsonTextUtil.ts';
import { STALE_GREEN_SESSION_OWNER_FORMAT_VERSION } from './StaleGreenSessionOwnerIngestion.ts';

export function createStaleGreenSessionOwnerWriter(ownerFilePath: string): { write(sessionOwnerJobId: string | null): void } {
  function write(sessionOwnerJobId: string | null): void {
    writeFileAtomically(ownerFilePath, JsonTextUtil.storedFileTextOf({ version: STALE_GREEN_SESSION_OWNER_FORMAT_VERSION, sessionOwnerJobId }));
  }

  return { write };
}
