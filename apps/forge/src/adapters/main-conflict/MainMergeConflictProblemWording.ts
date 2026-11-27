import { JobFileShapeUtil }              from '../utils/JobFileShapeUtil.ts';
import { StoredFileProblemWordingUtil }  from '../utils/StoredFileProblemWordingUtil.ts';
import type { MainMergeConflictProblem } from './@types/MainMergeConflictProblem.ts';

function sentenceOf(problem: MainMergeConflictProblem): string {
  return problem.code === 'field-is-not' ? JobFileShapeUtil.fieldProblemSentenceOf(problem) : StoredFileProblemWordingUtil.sentenceOf(problem);
}

export const MainMergeConflictProblemWording = Object.freeze({ sentenceOf });
