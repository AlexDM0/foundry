/**
 * `target-conflict.json`, the conflict a review's merge of the target met before its reviewer, kept in the review's folder for the builder
 * it sends the work back to, read into the conflict: read, validate, map.
 */
import { JobFileShapeUtil }           from '../utils/JobFileShapeUtil.ts';
import { StoredJsonDocumentUtil }     from '../utils/StoredJsonDocumentUtil.ts';
import type { TargetConflictProblem } from './@types/TargetConflictProblem.ts';

export const TARGET_CONFLICT_FORMAT_VERSION = 1;

/** The target tip the merge took, and the files it conflicted in. */
export interface TargetConflict {
  targetTip:       string;
  conflictedFiles: string[];
}

export type TargetConflictReading =
  | { verdict: 'readable'; conflict: TargetConflict }
  | { verdict: 'absent' }
  | { verdict: 'unreadable'; problem: TargetConflictProblem };

export class TargetConflictIngestion {
  constructor(private readonly conflictFilePath: string) {}

  /** Never throws: a conflict that cannot be read whole is `unreadable`, never a builder told nothing of it. */
  read(): TargetConflictReading {
    const stored = StoredJsonDocumentUtil.documentAt(this.conflictFilePath, TARGET_CONFLICT_FORMAT_VERSION);
    if (stored.verdict !== 'readable') return stored;
    const { document } = stored;
    const problem = JobFileShapeUtil.firstMistypedFieldOf(document, {
      targetTip:       [JobFileShapeUtil.valueIsText, 'a-commit'],
      conflictedFiles: [JobFileShapeUtil.valueIsATextList, 'a-list-of-paths'],
    });
    if (problem !== null) return { verdict: 'unreadable', problem };
    return { verdict: 'readable', conflict: { targetTip: document['targetTip'] as string, conflictedFiles: [...document['conflictedFiles'] as string[]] } };
  }
}
