/** The words of why the store lists a ticket, an epic, a draft or a ticket's documents as unreadable, for the line that reports it. */
import type { UnreadableTicketProblem } from '../shared/@types/UnreadableTicketProblem.ts';
import type {
  FileNameNamesAnotherKeyProblem,
  UnreadableDraftProblem,
  UnreadableEpicProblem,
  UnreadableTicketDocumentsProblem
} from './@types/UnreadableRecordProblem.ts';
import { DraftFileProblemWording }             from './drafts/DraftFileProblemWording.ts';
import { EpicFileProblemWording }              from './epics/EpicFileProblemWording.ts';
import { CommittedContentProblemWording }      from './tickets/CommittedContentProblemWording.ts';
import { TicketDocumentContentProblemWording } from './tickets/TicketDocumentContentProblemWording.ts';
import { TicketDocumentsProblemWording }       from './tickets/TicketDocumentsProblemWording.ts';
import { TicketFileProblemWording }            from './tickets/TicketFileProblemWording.ts';

function fileNameSentenceOf(problem: FileNameNamesAnotherKeyProblem): string {
  return `the file name says ${problem.keyInFileName} but its \`${problem.field}\` is ${problem.storedKey}`;
}

function ticketSentenceOf(problem: UnreadableTicketProblem): string {
  switch (problem.code) {
    case 'file-name-names-another-id': return `the file name says #${problem.idInFileName} but its \`${problem.field}\` is ${problem.storedId}`;
    case 'id-held-twice':              return `ticket #${problem.storedId} is also held by ${problem.otherFileNames.join(', ')}`;
    case 'committed-content-missing':  return CommittedContentProblemWording.sentenceOf(problem.contentProblem);
    default:                           return TicketFileProblemWording.sentenceOf(problem);
  }
}

function epicSentenceOf(problem: UnreadableEpicProblem): string {
  return problem.code === 'file-name-names-another-key' ? fileNameSentenceOf(problem) : EpicFileProblemWording.sentenceOf(problem);
}

function draftSentenceOf(problem: UnreadableDraftProblem): string {
  return problem.code === 'file-name-names-another-key' ? fileNameSentenceOf(problem) : DraftFileProblemWording.sentenceOf(problem);
}

function ticketDocumentsSentenceOf(problem: UnreadableTicketDocumentsProblem): string {
  switch (problem.code) {
    case 'folder-name-names-another-ticket':
      return `the folder name says ${problem.ticketIdInFolderName} but its \`${problem.field}\` is ${problem.storedTicketId}`;
    case 'no-text-under-the-hash':
    case 'text-hash-differs':
      return TicketDocumentContentProblemWording.sentenceOf(problem);
    default:
      return TicketDocumentsProblemWording.sentenceOf(problem);
  }
}

export const UnreadableRecordProblemWording = Object.freeze({
  ticketSentenceOf, epicSentenceOf, draftSentenceOf, ticketDocumentsSentenceOf
});
