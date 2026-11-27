import { StoredFileProblemWordingUtil } from '../utils/StoredFileProblemWordingUtil.ts';
import type { SeenHeadProblem }         from './@types/SeenHeadProblem.ts';

function sentenceOf(problem: SeenHeadProblem): string {
  switch (problem.code) {
    case 'not-text-or-null': return `its ${problem.field} is neither text nor null`;
    default:                 return StoredFileProblemWordingUtil.sentenceOf(problem);
  }
}

export const SeenHeadProblemWording = Object.freeze({ sentenceOf });
