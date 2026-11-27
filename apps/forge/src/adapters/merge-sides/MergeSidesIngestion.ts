/**
 * `target-merge.json` and `main-merge[-<round>].json`, the two tips a merge of the target into a ticket's worktree was checked against, kept
 * before its process starts, read into the merge's sides: read, validate, map.
 */
import { JobFileShapeUtil }       from '../utils/JobFileShapeUtil.ts';
import { StoredJsonDocumentUtil } from '../utils/StoredJsonDocumentUtil.ts';
import type { MergeSidesProblem } from './@types/MergeSidesProblem.ts';

export const MERGE_SIDES_FORMAT_VERSION = 1;

/** The commit the worktree starts from, its merge's first parent, and the one merged into it, its second. */
export interface MergeSides {
  startTip:  string;
  mergedTip: string;
}

export type MergeSidesReading =
  | { verdict: 'readable'; sides: MergeSides }
  | { verdict: 'absent' }
  | { verdict: 'unreadable'; problem: MergeSidesProblem };

export class MergeSidesIngestion {
  constructor(private readonly sidesFilePath: string) {}

  /** Never throws: a record that cannot be read whole is `unreadable`, never a merge that has yet to start. */
  read(): MergeSidesReading {
    const stored = StoredJsonDocumentUtil.documentAt(this.sidesFilePath, MERGE_SIDES_FORMAT_VERSION);
    if (stored.verdict !== 'readable') return stored;
    const { document } = stored;
    const problem = JobFileShapeUtil.firstMistypedFieldOf(document, {
      startTip:  [JobFileShapeUtil.valueIsText, 'a-commit'],
      mergedTip: [JobFileShapeUtil.valueIsText, 'a-commit'],
    });
    if (problem !== null) return { verdict: 'unreadable', problem };
    return { verdict: 'readable', sides: { startTip: document['startTip'] as string, mergedTip: document['mergedTip'] as string } };
  }
}
