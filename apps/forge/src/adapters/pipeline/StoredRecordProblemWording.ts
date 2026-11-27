import type { StoredRecordProblem }     from '../../lib/tracker-model/@types/StoredRecordProblem.ts';
import { StoredFileProblemWordingUtil } from '../utils/StoredFileProblemWordingUtil.ts';

/** The words of the field checks the pipeline's stored records share; a record that is no JSON object is "the document". */
function sentenceOf(problem: StoredRecordProblem): string {
  switch (problem.code) {
    case 'not-an-object':                  return `${problem.field} is not an object`;
    case 'missing':                        return `${problem.field} is missing`;
    case 'not-a-list':                     return `${problem.field} is not a list`;
    case 'not-a-text':                     return `${problem.field} is not a text`;
    case 'not-true-or-false':              return `${problem.field} is not true or false`;
    case 'not-a-whole-number-of-at-least': return `${problem.field} is not a whole number of at least ${problem.lowest}`;
    case 'names-twice':                    return `${problem.field} names ${JSON.stringify(problem.name)} twice`;
    case 'not-a-key-of':
      return `${problem.field}.${problem.key} is not a key of ${problem.field}; the keys are ${problem.knownKeys.join(', ')}`;
    case 'not-a-word-of':
      return `${problem.field} is ${JSON.stringify(problem.storedValue)}, which is not one of ${problem.vocabulary.join(', ')}`;
    case 'format-version-not-read':
      return `${problem.field} is ${JSON.stringify(problem.storedValue) ?? 'missing'}, and this build reads ${problem.readVersion}`;
    case 'not-a-json-object':              return 'the document is not a JSON object';
    default:                               return StoredFileProblemWordingUtil.sentenceOf(problem);
  }
}

export const StoredRecordProblemWording = Object.freeze({ sentenceOf });
