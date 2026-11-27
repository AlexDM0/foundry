import { JobFileShapeUtil }             from '../utils/JobFileShapeUtil.ts';
import { StoredFileProblemWordingUtil } from '../utils/StoredFileProblemWordingUtil.ts';
import type { MergeSidesProblem }       from './@types/MergeSidesProblem.ts';

function sentenceOf(problem: MergeSidesProblem): string {
  return problem.code === 'field-is-not' ? JobFileShapeUtil.fieldProblemSentenceOf(problem) : StoredFileProblemWordingUtil.sentenceOf(problem);
}

export const MergeSidesProblemWording = Object.freeze({ sentenceOf });
