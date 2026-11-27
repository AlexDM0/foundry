import { StoredFileProblemWordingUtil }                          from '../utils/StoredFileProblemWordingUtil.ts';
import type { LaunchRegistryLineProblem, LaunchRegistryProblem } from './@types/LaunchRegistryProblem.ts';

const MALFORMED_FIELD_SENTENCES = {
  childId:     'childId is not a string',
  childFolder: 'childFolder is not a string',
  instance:    'instance is not a whole number',
  kind:        'kind is neither agent nor line',
} as const;

/** One line's problem, as it reads without the line's number. */
function lineSentenceOf(problem: LaunchRegistryLineProblem): string {
  switch (problem.code) {
    case 'registry-line-not-json':          return StoredFileProblemWordingUtil.sentenceOf({ code: 'not-json', parserError: problem.parserError });
    case 'registry-line-not-a-json-object': return StoredFileProblemWordingUtil.sentenceOf({ code: 'not-a-json-object' });
    case 'registry-line-field-malformed':   return MALFORMED_FIELD_SENTENCES[problem.field];
  }
}

function sentenceOf(problem: LaunchRegistryProblem): string {
  switch (problem.code) {
    case 'registry-line-not-json':
    case 'registry-line-not-a-json-object':
    case 'registry-line-field-malformed':
      return `line ${problem.lineNumber}: ${lineSentenceOf(problem)}`;
    default:
      return StoredFileProblemWordingUtil.sentenceOf(problem);
  }
}

export const LaunchRegistryProblemWording = Object.freeze({ lineSentenceOf, sentenceOf });
