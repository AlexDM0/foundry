import { JobFileShapeUtil }                from '../utils/JobFileShapeUtil.ts';
import { StoredFileProblemWordingUtil }    from '../utils/StoredFileProblemWordingUtil.ts';
import type { MainMergeResolutionProblem } from './@types/MainMergeResolutionProblem.ts';

function sentenceOf(problem: MainMergeResolutionProblem): string {
  return problem.code === 'field-is-not' ? JobFileShapeUtil.fieldProblemSentenceOf(problem) : StoredFileProblemWordingUtil.sentenceOf(problem);
}

export const MainMergeResolutionProblemWording = Object.freeze({ sentenceOf });
