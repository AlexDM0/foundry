import { JobFileShapeUtil }             from '../utils/JobFileShapeUtil.ts';
import { StoredFileProblemWordingUtil } from '../utils/StoredFileProblemWordingUtil.ts';
import type { JobStartProblem }         from './@types/JobStartProblem.ts';

function sentenceOf(problem: JobStartProblem): string {
  return problem.code === 'field-is-not' ? JobFileShapeUtil.fieldProblemSentenceOf(problem) : StoredFileProblemWordingUtil.sentenceOf(problem);
}

export const JobStartProblemWording = Object.freeze({ sentenceOf });
