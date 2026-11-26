/**
 * `main-resolution[-<round>].json`, the resolution a job's session committed for its newest `merging-main` conflict as the first look after
 * it measured it, read into the resolution: read, validate, map.
 */
import { JobFileShapeUtil }       from '../utils/JobFileShapeUtil.ts';
import { StoredJsonDocumentUtil } from '../utils/StoredJsonDocumentUtil.ts';
import { StoredValueUtil }        from '../utils/StoredValueUtil.ts';

export const MAIN_MERGE_RESOLUTION_FORMAT_VERSION = 1;

const FIRST_ROUND = 1;

/** The newest conflict a job in `merging-main` sent its session, and the resolution its session committed for it, kept at the first look. */
export interface MainMergeResolution {
  conflictRound:    number;
  targetTip:        string;
  branchTip:        string;
  conflictedFiles:  string[];
  resolutionCommit: string;
  /** `null` when git cannot tell, which is re-reviewed. */
  lines:            number | null;
}

export type MainMergeResolutionReading =
  | { verdict: 'readable'; resolution: MainMergeResolution }
  | { verdict: 'absent' }
  | { verdict: 'unreadable'; reason: string };

export class MainMergeResolutionIngestion {
  constructor(private readonly resolutionFilePath: string) {}

  /** Never throws: a resolution that cannot be read whole is `unreadable`, never one still to measure, which a later commit would change. */
  read(): MainMergeResolutionReading {
    const stored = StoredJsonDocumentUtil.documentAt(this.resolutionFilePath, MAIN_MERGE_RESOLUTION_FORMAT_VERSION);
    if (stored.verdict !== 'readable') return stored;
    const { document } = stored;
    const problem = JobFileShapeUtil.firstFieldProblemOf(document, {
      conflictRound:    [(value) => StoredValueUtil.wholeNumberIsAtLeast(value, FIRST_ROUND), 'a round'],
      targetTip:        [JobFileShapeUtil.valueIsText, 'a commit'],
      branchTip:        [JobFileShapeUtil.valueIsText, 'a commit'],
      conflictedFiles:  [JobFileShapeUtil.valueIsATextList, 'a list of paths'],
      resolutionCommit: [JobFileShapeUtil.valueIsText, 'a commit'],
      lines:            [(value) => value === null || StoredValueUtil.wholeNumberIsAtLeast(value, 0), 'a line count or null'],
    });
    if (problem !== null) return { verdict: 'unreadable', reason: problem };
    return {
      verdict:    'readable',
      resolution: {
        conflictRound:    document['conflictRound'] as number,
        targetTip:        document['targetTip'] as string,
        branchTip:        document['branchTip'] as string,
        conflictedFiles:  [...document['conflictedFiles'] as string[]],
        resolutionCommit: document['resolutionCommit'] as string,
        lines:            document['lines'] as number | null,
      },
    };
  }
}
