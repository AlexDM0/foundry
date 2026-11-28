import { StoredFileProblemWording }  from '../StoredFileProblemWording.ts';
import type { HephaestusLogProblem } from './@types/HephaestusLogProblem.ts';

function sentenceOf(problem: HephaestusLogProblem): string {
  switch (problem.code) {
    case 'field-not-a-string': return `its "${problem.field}" is not a string`;
    default:                   return StoredFileProblemWording.sentenceOf(problem);
  }
}

export const HephaestusLogProblemWording = Object.freeze({ sentenceOf });
