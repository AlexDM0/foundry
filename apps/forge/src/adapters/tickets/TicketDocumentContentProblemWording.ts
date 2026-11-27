import { StoredFileProblemWording }          from '../StoredFileProblemWording.ts';
import type { TicketDocumentContentProblem } from './@types/TicketDocumentContentProblem.ts';

function sentenceOf(problem: TicketDocumentContentProblem): string {
  switch (problem.code) {
    case 'no-text-under-the-hash': return `no text is kept under the hash ${problem.contentHash}`;
    case 'text-hash-differs':      return `its text does not hash to ${problem.contentHash}`;
    default:                       return StoredFileProblemWording.sentenceOf(problem);
  }
}

export const TicketDocumentContentProblemWording = Object.freeze({ sentenceOf });
