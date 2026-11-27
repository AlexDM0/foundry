import { PRODUCT_NAMES }                from '../../shared/constants/ProductNames.ts';
import { OLDER_FORMAT_ADVICE }          from '../constants/OlderFormatAdvice.ts';
import { StoredFileProblemWordingUtil } from '../utils/StoredFileProblemWordingUtil.ts';
import type { DraftFileProblem }        from './@types/DraftFileProblem.ts';

const MISSING_VALUE_TEXT = 'missing';

function sentenceOf(problem: DraftFileProblem): string {
  switch (problem.code) {
    case 'file-unreadable':            return `the file could not be read: ${problem.systemError}`;
    case 'file-not-utf8-text':         return 'the file is not UTF-8 text';
    case 'document-not-a-json-object': return 'the document is not a JSON object';
    case 'version-not-read':
      return `${problem.field} is ${problem.storedValue ?? MISSING_VALUE_TEXT}, and this build of ${PRODUCT_NAMES.PROGRAM} reads version ${problem.readVersion}; `
        + OLDER_FORMAT_ADVICE;
    case 'not-a-draft-id':            return `${problem.field} is ${problem.storedValue ?? MISSING_VALUE_TEXT}, and it has to be a draft id such as D1`;
    case 'title-blank':               return `${problem.field} is not a text that is not blank`;
    case 'request-not-text':          return `${problem.field} is not a text`;
    case 'opened-at-not-a-timestamp': return `${problem.field} is not a timestamp`;
    case 'claim-malformed':           return `${problem.field} is neither null nor an object holding an owner and a claimedAt`;
    case 'notes-malformed':           return `${problem.field} is not a list of notes, each holding an id, a kind of fact or assumption, and a text`;
    case 'questions-malformed':       return `${problem.field} is not a list of questions, each with its options, recommendation, answer and follow-ups`;
    case 'item-numbers-below-first':  return `nextNoteNumber and nextQuestionNumber have to be whole numbers of at least ${problem.firstItemNumber}`;
    case 'entity-not-an-entity-key':  return `${problem.field} is not an entity key that is not blank`;
    case 'crosses-malformed':         return `${problem.field} is not a list of entity keys that are not blank`;
    default:                          return StoredFileProblemWordingUtil.sentenceOf(problem);
  }
}

export const DraftFileProblemWording = Object.freeze({ sentenceOf });
