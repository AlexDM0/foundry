import { writeFileAtomically }                 from '../../lib/atomic-file/AtomicFile.ts';
import { JsonTextUtil }                        from '../../shared/utils/JsonTextUtil.ts';
import type { ForcedStopRefusals }             from './@types/ForcedStopRefusals.ts';
import { REFUSED_FORCED_STOPS_FORMAT_VERSION } from './constants/RefusedForcedStopsFileVersions.ts';

export function createRefusedForcedStopsWriter(refusedForcedStopsFilePath: string): { write(forcedStopRefusals: ForcedStopRefusals): void } {
  function write({ refusals, treeProcessIds }: ForcedStopRefusals): void {
    writeFileAtomically(refusedForcedStopsFilePath, JsonTextUtil.storedFileTextOf({ version: REFUSED_FORCED_STOPS_FORMAT_VERSION, refusals, treeProcessIds }));
  }
  return { write };
}
