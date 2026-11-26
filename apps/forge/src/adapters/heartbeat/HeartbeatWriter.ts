import { writeFileAtomically }      from '../../lib/atomic-file/AtomicFile.ts';
import { JsonTextUtil }             from '../../shared/utils/JsonTextUtil.ts';
import type { HeartbeatRecord }     from './@types/HeartbeatRecord.ts';
import { HEARTBEAT_FORMAT_VERSION } from './constants/HeartbeatFileVersions.ts';

/** Whole and atomic, so a reader never sees half a beat. */
export function createHeartbeatWriter(heartbeatFilePath: string): { write(record: HeartbeatRecord): void } {
  function write(record: HeartbeatRecord): void {
    writeFileAtomically(heartbeatFilePath, JsonTextUtil.storedFileTextOf({ ...record, heartbeatVersion: HEARTBEAT_FORMAT_VERSION }));
  }
  return { write };
}
