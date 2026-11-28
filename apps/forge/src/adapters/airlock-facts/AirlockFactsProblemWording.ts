import { StoredFileProblemWording } from '../StoredFileProblemWording.ts';
import type { AirlockFactsProblem } from './@types/AirlockFactsProblem.ts';

function sentenceOf(problem: AirlockFactsProblem): string {
  switch (problem.code) {
    case 'not-a-list-of-file-paths': return `its "${problem.field}" is not a list of file paths`;
    case 'neither-true-nor-false':   return `its "${problem.field}" is neither true nor false`;
    default:                         return StoredFileProblemWording.sentenceOf(problem);
  }
}

export const AirlockFactsProblemWording = Object.freeze({ sentenceOf });
