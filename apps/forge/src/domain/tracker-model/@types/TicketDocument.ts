/**
 * A ticket's documents in the spec-then-plan route, kept by the local store as one record per ticket beside a content file per version.
 * A version is known by its content hash; its number is for display. Line numbers are 1-based, and a range includes both ends.
 */
export type TicketDocumentKind = 'spec' | 'plan';

/** In pipeline order: where two documents disagree, the later one wins. */
export const TICKET_DOCUMENT_KINDS: readonly TicketDocumentKind[] = Object.freeze(['spec', 'plan']);

export const TICKET_DOCUMENTS_FORMAT_VERSION = 1;

/** The most characters one version of a document holds (`document-too-long`). */
export const TICKET_DOCUMENT_CHARACTER_LIMIT = 200_000;

export type DocumentAuthor = 'person' | 'agent';

export type DocumentApprover = 'person' | 'pipeline';

export type ProposalMode = 'ask-first' | 'auto-apply';

/** `board`: forge itself tells the agent, such as an effect reading's result or an edit that conflicted. */
export type DocumentMessageSender = 'person' | 'board';

export type DocumentMessageState = 'queued' | 'sent' | 'applied' | 'withdrawn';

export type DocumentProposalState = 'proposed' | 'applied' | 'discarded' | 'conflicted';

export type CommentView = 'preview' | 'code';

export type DocumentStanding = 'unwritten' | 'drafting' | 'awaiting-review' | 'approved' | 'changed-since-approval' | 'out-of-date';

export interface LineRange {
  from: number;
  to:   number;
}

export interface ColumnRange {
  from: number;
  to:   number;
}

export interface DocumentVersion {
  number:              number;
  contentHash:         string;
  author:              DocumentAuthor;
  jobId?:              string;
  at:                  string;
  /** An agent's version: the main-line commit of the agent's snapshot. */
  constitutionCommit?: string;
}

/** Approvals are append-only: a later version never removes one. */
export interface DocumentApproval {
  /** The version number approved. */
  number:             number;
  contentHash:        string;
  by:                 DocumentApprover;
  at:                 string;
  /** The main line's tip at the approval. */
  constitutionCommit: string;
  /** A plan's approval only: the spec version it was approved on. */
  onSpecNumber?:      number;
  onSpecContentHash?: string;
}

export interface DiagramAnchor {
  lines:       LineRange;
  diagramKind: string;
  nodeId:      string;
  nodeLabel:   string;
}

export interface CommentAnchor {
  view:             CommentView;
  versionNumber:    number;
  lines:            LineRange;
  columns?:         ColumnRange;
  sectionPath:      string[];
  quote?:           string;
  surroundingLines: LineRange;
  diagram?:         DiagramAnchor;
}

/** User's answer to the document agent's question, in parts: its question, the option User chose and User's own words. */
export interface DocumentAnswer {
  question: string;
  /** The chosen option's label; `null` for an answer of free text alone. */
  choice:   string | null;
  /** User's note beside the option, or the free text; `null` with neither. */
  note:     string | null;
}

export interface DocumentMessage {
  /** `M<n>`. */
  messageId:       string;
  /** `C<n>`, only on an anchored message that answers no decision. */
  commentNumber?:  number;
  /** `E<n>`, only on User's answer to the document agent's own question, anchored where the question was. */
  decisionId?:     string;
  /** Written with `decisionId`. */
  answer?:         DocumentAnswer;
  /** As sent, never rewritten. */
  anchor?:         CommentAnchor;
  /** The anchor at the head version; absent when unanchored or orphaned. */
  placement?:      LineRange;
  orphaned?:       true;
  text:            string;
  from:            DocumentMessageSender;
  state:           DocumentMessageState;
  queuedAt:        string;
  /** Set when Hephaestus writes the message to the session. */
  deliveryNumber?: number;
  /** The agent turn the message opened, for the chat's order. */
  agentTurn?:      number;
}

/** Lines `fromLine` to `toLine` replaced; `toLine` one before `fromLine` inserts before `fromLine`. */
export interface LineEdit {
  fromLine:         number;
  toLine:           number;
  originalLines:    string[];
  replacementLines: string[];
}

export interface DocumentProposal {
  /** `P<n>`. */
  proposalId:        string;
  jobId:             string;
  /** `null`: the document's first write. */
  baseNumber:        number | null;
  edits:             LineEdit[];
  summary:           string;
  answersMessageId?: string;
  forSpecNumber?:    number;
  state:             DocumentProposalState;
  appliedNumber?:    number;
  at:                string;
}

export interface TicketDocument {
  kind:               TicketDocumentKind;
  versions:           DocumentVersion[];
  approvals:          DocumentApproval[];
  messages:           DocumentMessage[];
  proposals:          DocumentProposal[];
  proposalMode:       ProposalMode;
  /** The version the agent called ready. */
  readyAtNumber?:     number;
  nextMessageNumber:  number;
  nextCommentNumber:  number;
  nextProposalNumber: number;
}

export interface TicketDocumentRecord {
  version:   typeof TICKET_DOCUMENTS_FORMAT_VERSION;
  ticketId:  string;
  openedAt:  string;
  documents: TicketDocument[];
}

/** A record as the store loads it, with the text of every version it names keyed by content hash, so the Board judges without a file. */
export interface LoadedTicketDocumentRecord {
  record:            TicketDocumentRecord;
  textOfContentHash: Record<string, string>;
}
