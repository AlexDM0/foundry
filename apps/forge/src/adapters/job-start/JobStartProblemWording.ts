import { StoredFileProblemWording } from '../StoredFileProblemWording.ts';
import { JobFileShapeUtil }         from '../utils/JobFileShapeUtil.ts';
import type { JobStartProblem }     from './@types/JobStartProblem.ts';

function sentenceOf(problem: JobStartProblem): string {
  return problem.code === 'field-is-not' ? JobFileShapeUtil.fieldProblemSentenceOf(problem) : StoredFileProblemWording.sentenceOf(problem);
}

export const JobStartProblemWording = Object.freeze({ sentenceOf });
