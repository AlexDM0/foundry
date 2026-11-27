import { StoredFileProblemWording } from '../StoredFileProblemWording.ts';
import type { DeliveryBaseProblem } from './@types/DeliveryBaseProblem.ts';

function sentenceOf(problem: DeliveryBaseProblem): string {
  switch (problem.code) {
    case 'not-a-delivery-number': return `its ${problem.field} is not a whole number of at least 0`;
    default:                      return StoredFileProblemWording.sentenceOf(problem);
  }
}

export const DeliveryBaseProblemWording = Object.freeze({ sentenceOf });
