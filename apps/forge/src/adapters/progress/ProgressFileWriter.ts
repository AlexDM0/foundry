import type { TrackerProgress }                      from '../../domain/tracker-model/@types/TrackerProgress.ts';
import { createFileAtomically, writeFileAtomically } from '../../lib/atomic-file/AtomicFile.ts';
import { JsonTextUtil }                              from '../../shared/utils/JsonTextUtil.ts';
import { ProgressFileMappingUtil }                   from './utils/ProgressFileMappingUtil.ts';

/** Always the current version, indented and ending with a newline, because people repair the file by hand. */
function documentTextOf(progress: TrackerProgress): string {
  return JsonTextUtil.storedFileTextOf(ProgressFileMappingUtil.storedDocumentOf(progress));
}

export function createProgressFileWriter(progressRecordPath: string): {
  write(progress: TrackerProgress): void;
  create(progress: TrackerProgress): 'created' | 'already-exists';
  contentsOf(progress: TrackerProgress): string;
} {
  /** Through `src/lib/atomic-file/AtomicFile.ts`, because a subagent in another worktree may be reading this exact file right now. */
  function write(progress: TrackerProgress): void {
    writeFileAtomically(progressRecordPath, documentTextOf(progress));
  }

  /** `init`'s write: it never replaces a progress file, whatever path led to it, and says so instead. */
  function create(progress: TrackerProgress): 'created' | 'already-exists' {
    return createFileAtomically(progressRecordPath, documentTextOf(progress));
  }

  return { write, create, contentsOf: documentTextOf };
}
