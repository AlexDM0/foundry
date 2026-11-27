import type { GateProfilesProblem }   from '../../domain/tracker-model/@types/GateProfilesProblem.ts';
import { StoredRecordProblemWording } from './StoredRecordProblemWording.ts';

function sentenceOf(problem: GateProfilesProblem): string {
  switch (problem.code) {
    case 'not-an-id':
      return `${problem.field} is ${JSON.stringify(problem.storedValue)}, and it has to be an id such as ${problem.example}`;
    case 'neither-null-nor-a-whole-number-of-at-least':
      return `${problem.field} is neither null nor a whole number of at least ${problem.lowest}`;
    default:
      return StoredRecordProblemWording.sentenceOf(problem);
  }
}

export const GateProfilesProblemWording = Object.freeze({ sentenceOf });
