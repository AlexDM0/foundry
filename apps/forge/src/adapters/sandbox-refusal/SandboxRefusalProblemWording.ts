import { JobFileShapeUtil }             from '../utils/JobFileShapeUtil.ts';
import { StoredFileProblemWordingUtil } from '../utils/StoredFileProblemWordingUtil.ts';
import type { SandboxRefusalProblem }   from './@types/SandboxRefusalProblem.ts';

function sentenceOf(problem: SandboxRefusalProblem): string {
  return problem.code === 'field-is-not' ? JobFileShapeUtil.fieldProblemSentenceOf(problem) : StoredFileProblemWordingUtil.sentenceOf(problem);
}

export const SandboxRefusalProblemWording = Object.freeze({ sentenceOf });
