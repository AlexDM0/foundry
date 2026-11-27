import { StoredFileProblemWording }      from '../StoredFileProblemWording.ts';
import type { GateProfileOutputProblem } from './@types/GateProfileOutputProblem.ts';

function sentenceOf(problem: GateProfileOutputProblem): string {
  switch (problem.code) {
    case 'text-not-a-string': return `its "${problem.field}" is not a string`;
    default:                  return StoredFileProblemWording.sentenceOf(problem);
  }
}

export const GateProfileOutputProblemWording = Object.freeze({ sentenceOf });
