import { JobFileShapeUtil }             from '../utils/JobFileShapeUtil.ts';
import { StoredFileProblemWordingUtil } from '../utils/StoredFileProblemWordingUtil.ts';
import type { TargetConflictProblem }   from './@types/TargetConflictProblem.ts';

function sentenceOf(problem: TargetConflictProblem): string {
  return problem.code === 'field-is-not' ? JobFileShapeUtil.fieldProblemSentenceOf(problem) : StoredFileProblemWordingUtil.sentenceOf(problem);
}

export const TargetConflictProblemWording = Object.freeze({ sentenceOf });
