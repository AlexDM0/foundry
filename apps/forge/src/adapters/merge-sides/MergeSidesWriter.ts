import { writeFileAtomically }                         from '../../lib/atomic-file/AtomicFile.ts';
import { JsonTextUtil }                                from '../../shared/utils/JsonTextUtil.ts';
import { MERGE_SIDES_FORMAT_VERSION, type MergeSides } from './MergeSidesIngestion.ts';

/** Through `src/lib/atomic-file/AtomicFile.ts`: the merge's process starts only once both tips are on disk. */
export function createMergeSidesWriter(sidesFilePath: string): { write(sides: Readonly<MergeSides>): void } {
  function write(sides: Readonly<MergeSides>): void {
    writeFileAtomically(sidesFilePath, JsonTextUtil.storedFileTextOf({ version: MERGE_SIDES_FORMAT_VERSION, startTip: sides.startTip, mergedTip: sides.mergedTip }));
  }

  return { write };
}
