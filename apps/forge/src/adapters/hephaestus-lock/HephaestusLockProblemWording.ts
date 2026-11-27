import { StoredFileProblemWordingUtil } from '../utils/StoredFileProblemWordingUtil.ts';
import type { HephaestusLockProblem }   from './@types/HephaestusLockProblem.ts';

function sentenceOf(problem: HephaestusLockProblem): string {
  switch (problem.code) {
    case 'field-not-a-number': return `its "${problem.field}" is not a number`;
    case 'field-not-a-string': return `its "${problem.field}" is not a string`;
    default:                   return StoredFileProblemWordingUtil.sentenceOf(problem);
  }
}

export const HephaestusLockProblemWording = Object.freeze({ sentenceOf });
