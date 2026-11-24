/** User's moves on a ticket's spec and plan, each applied to the Board a `writeTracker` hold carries. */
import { GitProcess }                         from '../../lib/git/GitProcess.ts';
import type { ControlCommandOf as CommandOf } from '../../shared/@types/ControlCommand.ts';
import type { BoardTransaction }              from '../tracker/BoardTransaction.ts';
import { projectLocationOf }                  from '../tracker/ProjectLocation.ts';
import { ticketIdOfReference }                from './ControlTicketLookup.ts';
import { ticketDocumentMoveJudgesOf }         from './TicketDocumentMoveJudges.ts';

/** The repository's checked-out main line as User approves: what the approval was made against; empty where git cannot answer. */
function mainLineTipOf(change: BoardTransaction): string {
  return GitProcess.resolvedCommitOf(projectLocationOf(change.workspace.rootDirectory).repositoryRoot, 'HEAD') ?? '';
}

function save(command: CommandOf<'ticket-document-save'>, change: BoardTransaction) {
  return change.board.ticketDocuments().save(
    ticketIdOfReference(change, command.ticketReference),
    command.document,
    command.baseVersion,
    command.markdown,
    ticketDocumentMoveJudgesOf(command.document),
    change.at
  );
}

function comment(command: CommandOf<'ticket-document-comment'>, change: BoardTransaction) {
  return change.board.ticketDocuments().comment(ticketIdOfReference(change, command.ticketReference), command.document, command.anchor, command.text, change.at);
}

function withdrawComment(command: CommandOf<'ticket-document-comment-withdraw'>, change: BoardTransaction) {
  return change.board.ticketDocuments().withdrawComment(ticketIdOfReference(change, command.ticketReference), command.document, command.messageId);
}

function applyProposal(command: CommandOf<'ticket-document-proposal-apply'>, change: BoardTransaction) {
  return change.board.ticketDocuments().applyProposal(
    ticketIdOfReference(change, command.ticketReference),
    command.document,
    command.proposalId,
    command.replacementLines ?? null,
    ticketDocumentMoveJudgesOf(command.document),
    change.at
  );
}

function discardProposal(command: CommandOf<'ticket-document-proposal-discard'>, change: BoardTransaction) {
  return change.board.ticketDocuments().discardProposal(ticketIdOfReference(change, command.ticketReference), command.document, command.proposalId, change.at);
}

function setProposalMode(command: CommandOf<'ticket-document-mode-set'>, change: BoardTransaction) {
  return change.board.ticketDocuments().setProposalMode(ticketIdOfReference(change, command.ticketReference), command.document, command.mode, change.at);
}

function approve(command: CommandOf<'ticket-document-approve'>, change: BoardTransaction) {
  const ticketId = ticketIdOfReference(change, command.ticketReference);
  return change.board.ticketDocuments().approve(ticketId, command.document, command.version, mainLineTipOf(change), ticketDocumentMoveJudgesOf(command.document), change.at);
}

export const TICKET_DOCUMENT_CONTROLS = {
  'ticket-document-save':             save,
  'ticket-document-comment':          comment,
  'ticket-document-comment-withdraw': withdrawComment,
  'ticket-document-proposal-apply':   applyProposal,
  'ticket-document-proposal-discard': discardProposal,
  'ticket-document-mode-set':         setProposalMode,
  'ticket-document-approve':          approve,
} as const;
