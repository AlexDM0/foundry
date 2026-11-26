import { writeFileAtomically }     from '../../lib/atomic-file/AtomicFile.ts';
import { JsonTextUtil }            from '../../shared/utils/JsonTextUtil.ts';
import type { PresenceRecord }     from './@types/PresenceRecord.ts';
import { PRESENCE_FORMAT_VERSION } from './constants/PresenceFileVersions.ts';

/** Whole and atomic, synchronously, so a dying process still makes its write. */
export function createPresenceWriter(presenceFilePath: string): { write(record: PresenceRecord): void } {
  function write(record: PresenceRecord): void {
    writeFileAtomically(presenceFilePath, JsonTextUtil.storedFileTextOf({ ...record, presenceVersion: PRESENCE_FORMAT_VERSION }));
  }
  return { write };
}
