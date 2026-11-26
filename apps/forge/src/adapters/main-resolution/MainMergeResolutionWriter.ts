import { writeFileAtomically }                                            from '../../lib/atomic-file/AtomicFile.ts';
import { JsonTextUtil }                                                   from '../../shared/utils/JsonTextUtil.ts';
import { MAIN_MERGE_RESOLUTION_FORMAT_VERSION, type MainMergeResolution } from './MainMergeResolutionIngestion.ts';

/** Through `src/lib/atomic-file/AtomicFile.ts`, so the resolution measured at the first look is kept whole or not at all. */
export function createMainMergeResolutionWriter(resolutionFilePath: string): { write(resolution: Readonly<MainMergeResolution>): void } {
  function write(resolution: Readonly<MainMergeResolution>): void {
    writeFileAtomically(resolutionFilePath, JsonTextUtil.storedFileTextOf({ version: MAIN_MERGE_RESOLUTION_FORMAT_VERSION, ...resolution }));
  }

  return { write };
}
