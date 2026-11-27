import { JobFileShapeUtil }             from '../utils/JobFileShapeUtil.ts';
import { StoredFileProblemWordingUtil } from '../utils/StoredFileProblemWordingUtil.ts';
import type { StepVerdictProblem }      from './@types/StepVerdictProblem.ts';

function sentenceOf(problem: StepVerdictProblem): string {
  return problem.code === 'field-is-not' ? JobFileShapeUtil.fieldProblemSentenceOf(problem) : StoredFileProblemWordingUtil.sentenceOf(problem);
}

export const StepVerdictProblemWording = Object.freeze({ sentenceOf });
