import type { CommittedContentProblem } from '../../shared/@types/CommittedContentProblem.ts';
import { StoredFileProblemWordingUtil } from '../utils/StoredFileProblemWordingUtil.ts';
import { COMMITTED_CONTENT_MISSING }    from './CommittedContentFile.ts';

function contentSentenceOf(problem: CommittedContentProblem): string {
  switch (problem.code) {
    case 'no-content-under-the-hash':   return `no content is kept under the hash ${problem.contentHash}`;
    case 'not-a-title-and-body':        return 'it is not an object of a text "title" and a text "body"';
    case 'title-and-body-hash-differs': return `its title and body do not hash to ${problem.contentHash}`;
    default:                            return StoredFileProblemWordingUtil.sentenceOf(problem);
  }
}

/** The sentence opens on the code an unreadable ticket's kept content gives, as a ticket listing has always printed it. */
function sentenceOf(problem: CommittedContentProblem): string {
  return `${COMMITTED_CONTENT_MISSING}: ${contentSentenceOf(problem)}`;
}

export const CommittedContentProblemWording = Object.freeze({ sentenceOf });
