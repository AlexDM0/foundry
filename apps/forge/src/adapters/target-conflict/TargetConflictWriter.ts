import { writeFileAtomically }                                 from '../../lib/atomic-file/AtomicFile.ts';
import { JsonTextUtil }                                        from '../../shared/utils/JsonTextUtil.ts';
import { TARGET_CONFLICT_FORMAT_VERSION, type TargetConflict } from './TargetConflictIngestion.ts';

/** Through `src/lib/atomic-file/AtomicFile.ts`, so the builder the work goes back to never reads half a conflict. */
export function createTargetConflictWriter(conflictFilePath: string): { write(conflict: Readonly<TargetConflict>): void } {
  function write(conflict: Readonly<TargetConflict>): void {
    const { targetTip, conflictedFiles } = conflict;
    writeFileAtomically(conflictFilePath, JsonTextUtil.storedFileTextOf({ version: TARGET_CONFLICT_FORMAT_VERSION, targetTip, conflictedFiles }));
  }

  return { write };
}
