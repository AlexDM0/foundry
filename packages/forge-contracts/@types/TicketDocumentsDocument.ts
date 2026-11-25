/**
 * A ticket's documents in the spec-then-plan route, `GET /api/v1/tickets/{ticketId}/documents` from forge 4.2: each document's standing,
 * versions, approvals, messages to its agent and the agent's proposals, with the head's Markdown, and the newest effect reading of each.
 * Line numbers are 1-based and a range includes both ends. The Markdown is agent-written: a reader renders it with raw HTML as text.
 */
import type {
  DocumentMessageState,
  DocumentProposalState,
  DocumentStanding,
  EffectChange,
  ProposalMode,
  TicketDocumentKind
} from '../constants/BoardVocabulary.ts';

export type DocumentAuthor = 'person' | 'agent';

/** Who approves a document: the user while its review switch is on, else the pipeline when its agent calls it ready. */
export type DocumentApprover = 'person' | 'pipeline';

/** `board`: forge itself told the agent, such as an effect reading's result or an edit that conflicted. */
export type DocumentMessageSender = 'person' | 'board';

export type CommentView = 'preview' | 'code';

export type EffectReadingState = 'reading' | 'read' | 'failed';

export type EffectUnresolvedReason = 'ambiguous' | 'no-match';

export interface LineRangeDocument {
  readonly from: number;
  readonly to:   number;
}

export interface ColumnRangeDocument {
  readonly from: number;
  readonly to:   number;
}

export interface DocumentVersionDocument {
  readonly number:             number;
  readonly contentHash:        string;
  readonly author:             DocumentAuthor;
  readonly jobId:              string | null;
  readonly at:                 string;
  /** The main-line commit of an agent's snapshot; `null` on a person's version. */
  readonly constitutionCommit: string | null;
  /** How many commits changed the constitution up to that commit; `null` without one. */
  readonly constitutionNumber: number | null;
}

export interface DocumentApprovalDocument {
  /** The version number approved. */
  readonly number:             number;
  readonly contentHash:        string;
  readonly by:                 DocumentApprover;
  readonly at:                 string;
  /** The main line's tip at the approval. */
  readonly constitutionCommit: string;
  readonly constitutionNumber: number | null;
  /** A plan's approval only: the spec version it was approved on. */
  readonly onSpecNumber:       number | null;
  readonly onSpecContentHash:  string | null;
}

/** The mermaid node a comment was made on, at the lines of its source. */
export interface DiagramAnchorDocument {
  readonly lines:       LineRangeDocument;
  readonly diagramKind: string;
  readonly nodeId:      string;
  readonly nodeLabel:   string;
}

/** Where a comment was made, as sent: the version, the lines and the section it named then. */
export interface CommentAnchorDocument {
  readonly view:             CommentView;
  readonly versionNumber:    number;
  readonly lines:            LineRangeDocument;
  readonly columns?:         ColumnRangeDocument;
  /** The headings from the document's top down to the anchored lines. */
  readonly sectionPath:      readonly string[];
  readonly quote?:           string;
  readonly surroundingLines: LineRangeDocument;
  readonly diagram?:         DiagramAnchorDocument;
}

/** User's answer to the document agent's question: its question, the chosen option's label and User's own words, each as User sent it. */
export interface DocumentAnswerDocument {
  readonly question: string;
  /** `null` for an answer of free text alone. */
  readonly choice:   string | null;
  /** The note beside the option, or the free text; `null` with neither. */
  readonly note:     string | null;
}

export interface DocumentMessageDocument {
  /** `M1`, `M2`, … */
  readonly messageId:      string;
  /** The `C<n>` number of an anchored message; `null` when unanchored, and on an answer to a decision. */
  readonly commentNumber:  number | null;
  /**
   * From forge 4.4: the `E<n>` decision this message answers, the document agent's own question, anchored where the question was; `null`
   * on any other message.
   */
  readonly decisionId:     string | null;
  /** From forge 4.4: the answer in parts, with `decisionId`; `null` on any other message. */
  readonly answer:         DocumentAnswerDocument | null;
  readonly anchor:         CommentAnchorDocument | null;
  /** The anchor's lines at the head version; `null` when unanchored or orphaned. */
  readonly placement:      LineRangeDocument | null;
  /** The anchored text is gone; the anchor keeps its quote. */
  readonly orphaned:       boolean;
  readonly text:           string;
  readonly from:           DocumentMessageSender;
  readonly state:          DocumentMessageState;
  readonly queuedAt:       string;
  /** Set once Hephaestus wrote the message to the agent's session. */
  readonly deliveryNumber: number | null;
  /** The agent turn the message opened, for the chat's order. */
  readonly agentTurn:      number | null;
}

/** Lines `fromLine` to `toLine` replaced; `toLine` one before `fromLine` inserts before `fromLine`. */
export interface LineEditDocument {
  readonly fromLine:         number;
  readonly toLine:           number;
  readonly originalLines:    readonly string[];
  readonly replacementLines: readonly string[];
}

export interface DocumentProposalDocument {
  /** `P1`, `P2`, … */
  readonly proposalId:       string;
  readonly jobId:            string;
  /** The version the agent edited; `null` for the document's first write. */
  readonly baseNumber:       number | null;
  readonly edits:            readonly LineEditDocument[];
  readonly summary:          string;
  readonly answersMessageId: string | null;
  /** A plan's proposal only: the spec version it was written for. */
  readonly forSpecNumber:    number | null;
  readonly state:            DocumentProposalState;
  readonly appliedNumber:    number | null;
  readonly at:               string;
  /** The lines the proposal's edits cover at the head version; `null` when they no longer stand there. */
  readonly headLines:        LineRangeDocument | null;
}

/** One changed hunk between two versions: the lines at the older one and those that replace them at the newer, either side possibly empty. */
export interface LineChangeDocument {
  readonly originalFromLine:    number;
  readonly originalLines:       readonly string[];
  readonly replacementFromLine: number;
  readonly replacementLines:    readonly string[];
}

/** A plan approved on a spec version that is no longer the spec's approved head, and what changed in the spec since. */
export interface DocumentOutOfDateDocument {
  readonly approvedOnSpecNumber: number;
  readonly specNumber:           number;
  readonly specChanges:          readonly LineChangeDocument[];
}

export interface TicketDocumentDocument {
  readonly document:        TicketDocumentKind;
  readonly standing:        DocumentStanding;
  readonly reviewer:        DocumentApprover;
  /** The spec only: its approved version holds the ticket's Acceptance. */
  readonly holdsAcceptance: boolean;
  /** `false` once an agent picked the ticket up, or while the document's review is off. */
  readonly editable:        boolean;
  readonly proposalMode:    ProposalMode;
  readonly head:            DocumentVersionDocument | null;
  /** The head version's text; empty while the document has no version. */
  readonly markdown:        string;
  readonly versions:        readonly DocumentVersionDocument[];
  readonly approvals:       readonly DocumentApprovalDocument[];
  readonly messages:        readonly DocumentMessageDocument[];
  readonly proposals:       readonly DocumentProposalDocument[];
  /** The live document agent's job; `null` while none works the document. */
  readonly agentJobId:      string | null;
  readonly outOfDate:       DocumentOutOfDateDocument | null;
}

/** A sentence of the document the reading resolved, numbered as the marks after it read. */
export interface EffectReferenceDocument {
  readonly reference: number;
  readonly lines:     LineRangeDocument;
  readonly quote:     string;
}

export interface EffectEntryDocument {
  readonly reference:        number;
  readonly path:             string;
  readonly change:           EffectChange;
  readonly detail:           string;
  /** `null` unless `change` is `unresolved`. */
  readonly unresolvedReason: EffectUnresolvedReason | null;
  /** The paths an ambiguous entry may mean. */
  readonly candidates:       readonly string[];
}

/** The newest reading of what a document version names in the main line's tree; held in memory only. */
export interface EffectReadingDocument {
  readonly document:             TicketDocumentKind;
  readonly versionNumber:        number;
  readonly state:                EffectReadingState;
  /** `null` while the reading runs. */
  readonly durationMilliseconds: number | null;
  readonly references:           readonly EffectReferenceDocument[];
  readonly entries:              readonly EffectEntryDocument[];
}

export interface ForgeTicketDocumentsDocument {
  readonly ticketId:       string;
  readonly documents:      readonly TicketDocumentDocument[];
  readonly effectReadings: readonly EffectReadingDocument[];
}
