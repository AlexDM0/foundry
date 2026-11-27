import { StoredFileProblemWordingUtil } from '../utils/StoredFileProblemWordingUtil.ts';
import type { WaiverProposalsProblem }  from './@types/WaiverProposalsProblem.ts';

function sentenceOf(problem: WaiverProposalsProblem): string {
  switch (problem.code) {
    case 'not-a-list-of-proposals':               return `its "${problem.field}" is not a list of at least one proposal`;
    case 'proposal-without-text-item-and-reason': return `${problem.field} holds no text "item" and "reason"`;
    default:                                      return StoredFileProblemWordingUtil.sentenceOf(problem);
  }
}

export const WaiverProposalsProblemWording = Object.freeze({ sentenceOf });
