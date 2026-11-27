import { StoredFileProblemWording } from '../StoredFileProblemWording.ts';
import { JobFileShapeUtil }         from '../utils/JobFileShapeUtil.ts';
import type { RedHandoffProblem }   from './@types/RedHandoffProblem.ts';

function sentenceOf(problem: RedHandoffProblem): string {
  return problem.code === 'field-is-not' ? JobFileShapeUtil.fieldProblemSentenceOf(problem) : StoredFileProblemWording.sentenceOf(problem);
}

export const RedHandoffProblemWording = Object.freeze({ sentenceOf });
