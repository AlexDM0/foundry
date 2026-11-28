import { StoredFileProblemWording }        from '../StoredFileProblemWording.ts';
import { JobFileShapeUtil }                from '../utils/JobFileShapeUtil.ts';
import type { MainMergeResolutionProblem } from './@types/MainMergeResolutionProblem.ts';

function sentenceOf(problem: MainMergeResolutionProblem): string {
  return problem.code === 'field-is-not' ? JobFileShapeUtil.fieldProblemSentenceOf(problem) : StoredFileProblemWording.sentenceOf(problem);
}

export const MainMergeResolutionProblemWording = Object.freeze({ sentenceOf });
