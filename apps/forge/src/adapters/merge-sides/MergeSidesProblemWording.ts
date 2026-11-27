import { StoredFileProblemWording } from '../StoredFileProblemWording.ts';
import { JobFileShapeUtil }         from '../utils/JobFileShapeUtil.ts';
import type { MergeSidesProblem }   from './@types/MergeSidesProblem.ts';

function sentenceOf(problem: MergeSidesProblem): string {
  return problem.code === 'field-is-not' ? JobFileShapeUtil.fieldProblemSentenceOf(problem) : StoredFileProblemWording.sentenceOf(problem);
}

export const MergeSidesProblemWording = Object.freeze({ sentenceOf });
