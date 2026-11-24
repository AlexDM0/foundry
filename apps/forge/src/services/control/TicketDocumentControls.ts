/** User's moves on a ticket's spec and plan, each applied to the Board a `writeTracker` hold carries. */

function documentMoveNotBuilt(): never {
  throw new Error('lane B');
}

export const TICKET_DOCUMENT_CONTROLS = {
  'ticket-document-save':             documentMoveNotBuilt,
  'ticket-document-comment':          documentMoveNotBuilt,
  'ticket-document-comment-withdraw': documentMoveNotBuilt,
  'ticket-document-proposal-apply':   documentMoveNotBuilt,
  'ticket-document-proposal-discard': documentMoveNotBuilt,
  'ticket-document-mode-set':         documentMoveNotBuilt,
  'ticket-document-approve':          documentMoveNotBuilt,
} as const;
