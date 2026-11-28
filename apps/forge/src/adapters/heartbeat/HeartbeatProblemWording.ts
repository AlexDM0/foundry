import { StoredFileProblemWording }              from '../StoredFileProblemWording.ts';
import type { HeartbeatField, HeartbeatProblem } from './@types/HeartbeatProblem.ts';

const MALFORMED_FIELD_SENTENCES: Readonly<Record<HeartbeatField, string>> = {
  generation: 'generation is not a whole number from 1',
  sequence:   'sequence is not a whole number from 1',
  at:         'at is not a string',
};

function sentenceOf(problem: HeartbeatProblem): string {
  switch (problem.code) {
    case 'heartbeat-field-malformed': return MALFORMED_FIELD_SENTENCES[problem.field];
    default:                          return StoredFileProblemWording.sentenceOf(problem);
  }
}

export const HeartbeatProblemWording = Object.freeze({ sentenceOf });
