import { StoredFileProblemWordingUtil } from '../utils/StoredFileProblemWordingUtil.ts';
import type { GateRunSlotProblem }      from './@types/GateRunSlotProblem.ts';

function sentenceOf(problem: GateRunSlotProblem): string {
  switch (problem.code) {
    case 'names-no-holder':              return 'it names no holder';
    case 'field-not-a-process-identity': return `its "${problem.field}" is not a process identity`;
    default:                             return StoredFileProblemWordingUtil.sentenceOf(problem);
  }
}

export const GateRunSlotProblemWording = Object.freeze({ sentenceOf });
