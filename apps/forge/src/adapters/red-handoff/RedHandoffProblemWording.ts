import { JobFileShapeUtil }             from '../utils/JobFileShapeUtil.ts';
import { StoredFileProblemWordingUtil } from '../utils/StoredFileProblemWordingUtil.ts';
import type { RedHandoffProblem }       from './@types/RedHandoffProblem.ts';

function sentenceOf(problem: RedHandoffProblem): string {
  return problem.code === 'field-is-not' ? JobFileShapeUtil.fieldProblemSentenceOf(problem) : StoredFileProblemWordingUtil.sentenceOf(problem);
}

export const RedHandoffProblemWording = Object.freeze({ sentenceOf });
