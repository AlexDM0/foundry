import { StoredFileProblemWording }       from '../StoredFileProblemWording.ts';
import type { RefusedForcedStopsProblem } from './@types/RefusedForcedStopsProblem.ts';

const MALFORMED_FIELD_SENTENCES = {
  refusals:       'refusals is not a whole number from 1',
  treeProcessIds: 'treeProcessIds is not a list of process ids',
} as const;

function sentenceOf(problem: RefusedForcedStopsProblem): string {
  switch (problem.code) {
    case 'refused-forced-stops-field-malformed': return MALFORMED_FIELD_SENTENCES[problem.field];
    default:                                     return StoredFileProblemWording.sentenceOf(problem);
  }
}

export const RefusedForcedStopsProblemWording = Object.freeze({ sentenceOf });
