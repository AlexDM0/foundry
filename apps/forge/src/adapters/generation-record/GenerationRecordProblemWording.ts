import { StoredFileProblemWording }     from '../StoredFileProblemWording.ts';
import type { GenerationRecordProblem } from './@types/GenerationRecordProblem.ts';
import { GENERATION_STATES }            from './GenerationRecordIngestion.ts';

function sentenceOf(problem: GenerationRecordProblem): string {
  switch (problem.code) {
    case 'field-not-a-process-identity': return `its "${problem.field}" is not a process identity`;
    case 'field-not-a-string':           return `its "${problem.field}" is not a string`;
    case 'state-not-a-generation-state': return `its "${problem.field}" is not one of ${GENERATION_STATES.join(', ')}`;
    default:                             return StoredFileProblemWording.sentenceOf(problem);
  }
}

export const GenerationRecordProblemWording = Object.freeze({ sentenceOf });
