import { writeFileAtomically }                                    from '../../lib/atomic-file/AtomicFile.ts';
import { JsonTextUtil }                                           from '../../shared/utils/JsonTextUtil.ts';
import { GATE_RUN_MANIFEST_FORMAT_VERSION, type GateRunManifest } from './GateRunManifestIngestion.ts';

/** Through `src/lib/atomic-file/AtomicFile.ts`: the run's first step starts only once the whole manifest is on disk. */
export function createGateRunManifestWriter(manifestFilePath: string): { write(manifest: Readonly<GateRunManifest>): void } {
  function write(manifest: Readonly<GateRunManifest>): void {
    writeFileAtomically(manifestFilePath, JsonTextUtil.storedFileTextOf({ version: GATE_RUN_MANIFEST_FORMAT_VERSION, ...manifest }));
  }

  return { write };
}
