import { writeFileAtomically }                                        from '../../lib/atomic-file/AtomicFile.ts';
import { JsonTextUtil }                                               from '../../shared/utils/JsonTextUtil.ts';
import { MAIN_MERGE_CONFLICT_FORMAT_VERSION, type MainMergeConflict } from './MainMergeConflictIngestion.ts';

/** Through `src/lib/atomic-file/AtomicFile.ts`, so a later round never reads half a conflict. */
export function createMainMergeConflictWriter(conflictFilePath: string): { write(conflict: Readonly<MainMergeConflict>): void } {
  function write(conflict: Readonly<MainMergeConflict>): void {
    writeFileAtomically(conflictFilePath, JsonTextUtil.storedFileTextOf({
      version: MAIN_MERGE_CONFLICT_FORMAT_VERSION, targetTip: conflict.targetTip, branchTip: conflict.branchTip, conflictedFiles: conflict.conflictedFiles,
    }));
  }

  return { write };
}
