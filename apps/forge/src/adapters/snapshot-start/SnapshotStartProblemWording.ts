import { JobFileShapeUtil }             from '../utils/JobFileShapeUtil.ts';
import { StoredFileProblemWordingUtil } from '../utils/StoredFileProblemWordingUtil.ts';
import type { SnapshotStartProblem }    from './@types/SnapshotStartProblem.ts';

function sentenceOf(problem: SnapshotStartProblem): string {
  switch (problem.code) {
    case 'start-commit-not-a-commit': return `its ${problem.field} is not a commit`;
    case 'field-is-not':              return JobFileShapeUtil.fieldProblemSentenceOf(problem);
    default:                          return StoredFileProblemWordingUtil.sentenceOf(problem);
  }
}

export const SnapshotStartProblemWording = Object.freeze({ sentenceOf });
