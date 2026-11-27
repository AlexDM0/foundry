import { StoredFileProblemWordingUtil }  from '../utils/StoredFileProblemWordingUtil.ts';
import type { GateProfileOutputProblem } from './@types/GateProfileOutputProblem.ts';

function sentenceOf(problem: GateProfileOutputProblem): string {
  switch (problem.code) {
    case 'text-not-a-string': return `its "${problem.field}" is not a string`;
    default:                  return StoredFileProblemWordingUtil.sentenceOf(problem);
  }
}

export const GateProfileOutputProblemWording = Object.freeze({ sentenceOf });
