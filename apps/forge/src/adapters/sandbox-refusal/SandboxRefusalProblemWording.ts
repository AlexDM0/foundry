import { StoredFileProblemWording }   from '../StoredFileProblemWording.ts';
import { JobFileShapeUtil }           from '../utils/JobFileShapeUtil.ts';
import type { SandboxRefusalProblem } from './@types/SandboxRefusalProblem.ts';

function sentenceOf(problem: SandboxRefusalProblem): string {
  return problem.code === 'field-is-not' ? JobFileShapeUtil.fieldProblemSentenceOf(problem) : StoredFileProblemWording.sentenceOf(problem);
}

export const SandboxRefusalProblemWording = Object.freeze({ sentenceOf });
