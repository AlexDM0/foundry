/**
 * `main-conflict[-<round>].json`, the conflict a round of `merging-main` sent the job's session, read into the conflict: read, validate,
 * map.
 */
import { JobFileShapeUtil }              from '../utils/JobFileShapeUtil.ts';
import { StoredJsonDocumentUtil }        from '../utils/StoredJsonDocumentUtil.ts';
import type { MainMergeConflictProblem } from './@types/MainMergeConflictProblem.ts';

export const MAIN_MERGE_CONFLICT_FORMAT_VERSION = 1;

/** What a round whose merge conflicted keeps, for the resolution read after it and the conflict re-reviewer's launch. */
export interface MainMergeConflict {
  targetTip:       string;
  branchTip:       string;
  conflictedFiles: string[];
}

export type MainMergeConflictReading =
  | { verdict: 'readable'; conflict: MainMergeConflict }
  | { verdict: 'absent' }
  | { verdict: 'unreadable'; problem: MainMergeConflictProblem };

export class MainMergeConflictIngestion {
  constructor(private readonly conflictFilePath: string) {}

  /** Never throws: a conflict that cannot be read whole is `unreadable`, never a round that did not conflict. */
  read(): MainMergeConflictReading {
    const stored = StoredJsonDocumentUtil.documentAt(this.conflictFilePath, MAIN_MERGE_CONFLICT_FORMAT_VERSION);
    if (stored.verdict !== 'readable') return stored;
    const { document } = stored;
    const problem = JobFileShapeUtil.firstMistypedFieldOf(document, {
      targetTip:       [JobFileShapeUtil.valueIsText, 'a-commit'],
      branchTip:       [JobFileShapeUtil.valueIsText, 'a-commit'],
      conflictedFiles: [JobFileShapeUtil.valueIsATextList, 'a-list-of-paths'],
    });
    if (problem !== null) return { verdict: 'unreadable', problem };
    return {
      verdict:  'readable',
      conflict: { targetTip: document['targetTip'] as string, branchTip: document['branchTip'] as string, conflictedFiles: [...document['conflictedFiles'] as string[]] },
    };
  }
}
