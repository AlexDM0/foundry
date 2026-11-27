import type { StoredFileProblem }            from '../../shared/@types/StoredFileProblem.ts';
import type { DraftFileProblem }             from '../drafts/@types/DraftFileProblem.ts';
import type { EpicFileProblem }              from '../epics/@types/EpicFileProblem.ts';
import type { TicketDocumentContentProblem } from '../tickets/@types/TicketDocumentContentProblem.ts';
import type { TicketDocumentsProblem }       from '../tickets/@types/TicketDocumentsProblem.ts';

/** A stored item is its file name: one whose `field` names another key is unreadable, since which of the two it is cannot be judged. */
export type FileNameNamesAnotherKeyProblem =
  StoredFileProblem<'file-name-names-another-key'> & { readonly field: string; readonly keyInFileName: string; readonly storedKey: string };

/** Why the store lists an epic as unreadable. */
export type UnreadableEpicProblem = EpicFileProblem | FileNameNamesAnotherKeyProblem;

/** Why the store lists a draft as unreadable. */
export type UnreadableDraftProblem = DraftFileProblem | FileNameNamesAnotherKeyProblem;

/** Why the store lists a ticket's documents as unreadable: the record, its folder name against its `ticketId`, or a version it names. */
export type UnreadableTicketDocumentsProblem =
  | TicketDocumentsProblem
  | TicketDocumentContentProblem
  | StoredFileProblem<'folder-name-names-another-ticket'> & { readonly field: 'ticketId'; readonly ticketIdInFolderName: string; readonly storedTicketId: string };
