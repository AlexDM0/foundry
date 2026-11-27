import { StoredFileProblemWording }   from '../StoredFileProblemWording.ts';
import { JobFileShapeUtil }           from '../utils/JobFileShapeUtil.ts';
import type { TargetConflictProblem } from './@types/TargetConflictProblem.ts';

function sentenceOf(problem: TargetConflictProblem): string {
  return problem.code === 'field-is-not' ? JobFileShapeUtil.fieldProblemSentenceOf(problem) : StoredFileProblemWording.sentenceOf(problem);
}

export const TargetConflictProblemWording = Object.freeze({ sentenceOf });
