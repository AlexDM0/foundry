import { StoredFileProblemWording } from '../StoredFileProblemWording.ts';
import type { AgentSlotProblem }    from './@types/AgentSlotProblem.ts';

function sentenceOf(problem: AgentSlotProblem): string {
  switch (problem.code) {
    case 'field-not-a-string':           return `its "${problem.field}" is not a string`;
    case 'field-not-a-process-identity': return `its "${problem.field}" is not a process identity`;
    default:                             return StoredFileProblemWording.sentenceOf(problem);
  }
}

export const AgentSlotProblemWording = Object.freeze({ sentenceOf });
