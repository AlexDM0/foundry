import { StoredFileProblemWordingUtil } from '../utils/StoredFileProblemWordingUtil.ts';
import type { TicketDocumentsProblem }  from './@types/TicketDocumentsProblem.ts';

function sentenceOf(problem: TicketDocumentsProblem): string {
  switch (problem.code) {
    case 'record-file-missing':      return 'the file is missing';
    case 'record-not-an-object':     return 'the record is not an object';
    case 'record-version-differs':   return `${problem.field} is not ${problem.expectedVersion}`;
    case 'field-not-an-object':      return `${problem.field} is not an object`;
    case 'field-not-text':           return `${problem.field} is not text`;
    case 'field-not-a-whole-number': return `${problem.field} is not a whole number`;
    case 'field-not-a-list':         return `${problem.field} is not a list`;
    case 'field-not-one-of':         return `${problem.field} is not one of ${problem.allowedValues.join(', ')}`;
    case 'field-not-true':           return `${problem.field} is not true`;
    case 'kind-held-twice':          return `${problem.field} holds a kind twice`;
    default:                         return StoredFileProblemWordingUtil.sentenceOf(problem);
  }
}

export const TicketDocumentsProblemWording = Object.freeze({ sentenceOf });
