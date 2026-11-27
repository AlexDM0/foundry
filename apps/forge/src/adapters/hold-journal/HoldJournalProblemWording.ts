import type { HoldJournalProblem }      from '../../shared/@types/HoldJournalProblem.ts';
import { StoredFileProblemWordingUtil } from '../utils/StoredFileProblemWordingUtil.ts';

function sentenceOf(problem: HoldJournalProblem): string {
  switch (problem.code) {
    case 'files-not-a-list':                   return 'its "files" is not a list';
    case 'entry-not-an-object':                return `${problem.field} is not an object`;
    case 'entry-path-outside-the-data-folder': return `${problem.field} is not a path inside the data folder`;
    case 'entry-neither-contents-nor-removed': return `${problem.field} holds neither a string "contents" nor "removed": true`;
    default:                                   return StoredFileProblemWordingUtil.sentenceOf(problem);
  }
}

export const HoldJournalProblemWording = Object.freeze({ sentenceOf });
