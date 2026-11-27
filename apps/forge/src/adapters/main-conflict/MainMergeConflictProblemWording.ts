import { StoredFileProblemWording }      from '../StoredFileProblemWording.ts';
import { JobFileShapeUtil }              from '../utils/JobFileShapeUtil.ts';
import type { MainMergeConflictProblem } from './@types/MainMergeConflictProblem.ts';

function sentenceOf(problem: MainMergeConflictProblem): string {
  return problem.code === 'field-is-not' ? JobFileShapeUtil.fieldProblemSentenceOf(problem) : StoredFileProblemWording.sentenceOf(problem);
}

export const MainMergeConflictProblemWording = Object.freeze({ sentenceOf });
