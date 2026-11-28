import { StoredFileProblemWording } from '../StoredFileProblemWording.ts';
import { JobFileShapeUtil }         from '../utils/JobFileShapeUtil.ts';
import type { StepVerdictProblem }  from './@types/StepVerdictProblem.ts';

function sentenceOf(problem: StepVerdictProblem): string {
  return problem.code === 'field-is-not' ? JobFileShapeUtil.fieldProblemSentenceOf(problem) : StoredFileProblemWording.sentenceOf(problem);
}

export const StepVerdictProblemWording = Object.freeze({ sentenceOf });
