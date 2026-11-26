import { writeFileAtomically }                               from '../../lib/atomic-file/AtomicFile.ts';
import { JsonTextUtil }                                      from '../../shared/utils/JsonTextUtil.ts';
import { SNAPSHOT_START_FORMAT_VERSION, type SnapshotStart } from './SnapshotStartIngestion.ts';

/** Rewritten before each launch of an instance, whole, so a turn end never reads a torn start. */
export function createSnapshotStartWriter(snapshotStartFilePath: string): { write(snapshotStart: SnapshotStart): void } {
  function write({ startCommit, launchSnapshot }: SnapshotStart): void {
    writeFileAtomically(snapshotStartFilePath, JsonTextUtil.storedFileTextOf({ version: SNAPSHOT_START_FORMAT_VERSION, startCommit, launchSnapshot }));
  }
  return { write };
}
