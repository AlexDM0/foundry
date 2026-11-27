import { StoredFileProblemWordingUtil }                 from '../utils/StoredFileProblemWordingUtil.ts';
import type { PresenceMalformedField, PresenceProblem } from './@types/PresenceProblem.ts';

const MALFORMED_FIELD_SENTENCES: Readonly<Record<PresenceMalformedField, string>> = {
  generation:          'generation is not a whole number from 1',
  process:             'process is not a process identity',
  codeVersion:         'codeVersion is not a string',
  startOrigin:         'startOrigin is not a start origin',
  startedAt:           'startedAt is not a string',
  startClassification: 'startClassification is neither null nor a start classification',
  abandonedPasses:     'abandonedPasses is not a count with its last abandoned pass',
  ending:              'ending is neither null nor an ending',
};

function sentenceOf(problem: PresenceProblem): string {
  switch (problem.code) {
    case 'presence-field-malformed': return MALFORMED_FIELD_SENTENCES[problem.field];
    default:                         return StoredFileProblemWordingUtil.sentenceOf(problem);
  }
}

export const PresenceProblemWording = Object.freeze({ sentenceOf });
