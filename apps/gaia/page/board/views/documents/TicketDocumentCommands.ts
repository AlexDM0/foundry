/**
 * The commands User's moves on a ticket's spec or plan send, each under the forge's kind name with the board command version. The board's
 * command union does not hold the document kinds yet, so `boardCommandOf` hands a document command to the board's sender as one of its own.
 */
import { PAGE_CONTRACT_VERSIONS }                                        from '../../../../src/shared/constants/PageContractVersions.ts';
import type { BoardCommandDocument, BoardTicketDocumentCommandDocument } from '../../../@types/board/BoardCommandDocument.ts';
import type { BoardProposalMode, BoardTicketDocumentKind }               from '../../../@types/board/BoardVocabulary.ts';
import type { BoardCommentAnchorDocument }                               from '../../../@types/board/TicketDocumentsDocument.ts';

export interface DocumentPlace {
  readonly ticketId: string;
  readonly document: BoardTicketDocumentKind;
}

function boardCommandOf(command: BoardTicketDocumentCommandDocument): BoardCommandDocument {
  return command as unknown as BoardCommandDocument;
}

const VERSION = { boardCommandVersion: PAGE_CONTRACT_VERSIONS.gaiaBoardCommand } as const;

function saveOf({ ticketId, document }: DocumentPlace, baseVersion: number | null, markdown: string): BoardCommandDocument {
  return boardCommandOf({
    ...VERSION, kind: 'ticket-document-save', ticketId, document, baseVersion, markdown,
  });
}

function commentOf({ ticketId, document }: DocumentPlace, anchor: BoardCommentAnchorDocument | null, text: string): BoardCommandDocument {
  return boardCommandOf({
    ...VERSION, kind: 'ticket-document-comment', ticketId, document, anchor, text,
  });
}

function withdrawOf({ ticketId, document }: DocumentPlace, messageId: string): BoardCommandDocument {
  return boardCommandOf({
    ...VERSION, kind: 'ticket-document-comment-withdraw', ticketId, document, messageId,
  });
}

/** `replacementLines` is User's own text for each edit, `null` to apply the agent's. */
function applyOf({ ticketId, document }: DocumentPlace, proposalId: string, replacementLines: readonly (readonly string[])[] | null): BoardCommandDocument {
  return boardCommandOf({
    ...VERSION, kind: 'ticket-document-proposal-apply', ticketId, document, proposalId, replacementLines,
  });
}

function discardOf({ ticketId, document }: DocumentPlace, proposalId: string): BoardCommandDocument {
  return boardCommandOf({
    ...VERSION, kind: 'ticket-document-proposal-discard', ticketId, document, proposalId,
  });
}

function modeOf({ ticketId, document }: DocumentPlace, mode: BoardProposalMode): BoardCommandDocument {
  return boardCommandOf({
    ...VERSION, kind: 'ticket-document-mode-set', ticketId, document, mode,
  });
}

function approveOf({ ticketId, document }: DocumentPlace, version: number): BoardCommandDocument {
  return boardCommandOf({
    ...VERSION, kind: 'ticket-document-approve', ticketId, document, version,
  });
}

function effectReadOf({ ticketId, document }: DocumentPlace, version: number): BoardCommandDocument {
  return boardCommandOf({
    ...VERSION, kind: 'ticket-document-effect-read', ticketId, document, version,
  });
}

function turnStopOf({ ticketId, document }: DocumentPlace): BoardCommandDocument {
  return boardCommandOf({
    ...VERSION, kind: 'ticket-document-turn-stop', ticketId, document
  });
}

export const TicketDocumentCommands = Object.freeze({
  saveOf,
  commentOf,
  withdrawOf,
  applyOf,
  discardOf,
  modeOf,
  approveOf,
  effectReadOf,
  turnStopOf,
});
