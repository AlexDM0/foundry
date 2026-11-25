/**
 * A ticket's spec and plan as Gaia holds them, from a forge in the spec-then-plan route: each document's standing, versions, approvals,
 * messages to its agent and the agent's proposals, the head's Markdown as source text, and the newest effect reading of each. Line numbers
 * are 1-based, and a range includes both ends.
 */
import type {
  BoardCommentView,
  BoardDocumentApprover,
  BoardDocumentAuthor,
  BoardDocumentMessageSender,
  BoardDocumentMessageState,
  BoardDocumentProposalState,
  BoardDocumentStanding,
  BoardEffectChange,
  BoardEffectReadingState,
  BoardEffectUnresolvedReason,
  BoardProposalMode,
  BoardTicketDocumentKind,
} from './BoardVocabulary.ts';

export interface BoardLineRange {
  readonly from: number;
  readonly to:   number;
}

export interface BoardColumnRange {
  readonly from: number;
  readonly to:   number;
}

export interface BoardDocumentVersion {
  readonly number:             number;
  readonly contentHash:        string;
  readonly author:             BoardDocumentAuthor;
  readonly jobId:              string | null;
  readonly at:                 string;
  readonly constitutionCommit: string | null;
  readonly constitutionNumber: number | null;
}

export interface BoardDocumentApproval {
  readonly number:             number;
  readonly contentHash:        string;
  readonly by:                 BoardDocumentApprover;
  readonly at:                 string;
  readonly constitutionCommit: string;
  readonly constitutionNumber: number | null;
  /** A plan's approval only: the spec version it was approved on. */
  readonly onSpecNumber:       number | null;
  readonly onSpecContentHash:  string | null;
}

export interface BoardDiagramAnchor {
  readonly lines:       BoardLineRange;
  readonly diagramKind: string;
  readonly nodeId:      string;
  readonly nodeLabel:   string;
}

/** Where a comment was made, as sent. */
export interface BoardCommentAnchor {
  readonly view:             BoardCommentView;
  readonly versionNumber:    number;
  readonly lines:            BoardLineRange;
  readonly columns:          BoardColumnRange | null;
  readonly sectionPath:      readonly string[];
  readonly quote:            string | null;
  readonly surroundingLines: BoardLineRange;
  readonly diagram:          BoardDiagramAnchor | null;
}

export interface BoardDocumentMessage {
  readonly messageId:      string;
  readonly commentNumber:  number | null;
  /** The decision this message answers, the document agent's own question, anchored where the question was; `null` on any other. */
  readonly decisionId:     string | null;
  readonly anchor:         BoardCommentAnchor | null;
  /** The anchor's lines at the head version; `null` when unanchored or orphaned. */
  readonly placement:      BoardLineRange | null;
  readonly orphaned:       boolean;
  readonly text:           string;
  readonly from:           BoardDocumentMessageSender;
  readonly state:          BoardDocumentMessageState;
  readonly queuedAt:       string;
  readonly deliveryNumber: number | null;
  readonly agentTurn:      number | null;
}

export interface BoardLineEdit {
  readonly fromLine:         number;
  readonly toLine:           number;
  readonly originalLines:    readonly string[];
  readonly replacementLines: readonly string[];
}

export interface BoardDocumentProposal {
  readonly proposalId:       string;
  readonly jobId:            string;
  readonly baseNumber:       number | null;
  readonly edits:            readonly BoardLineEdit[];
  readonly summary:          string;
  readonly answersMessageId: string | null;
  readonly forSpecNumber:    number | null;
  readonly state:            BoardDocumentProposalState;
  readonly appliedNumber:    number | null;
  readonly at:               string;
  readonly headLines:        BoardLineRange | null;
}

export interface BoardLineChange {
  readonly originalFromLine:    number;
  readonly originalLines:       readonly string[];
  readonly replacementFromLine: number;
  readonly replacementLines:    readonly string[];
}

export interface BoardDocumentOutOfDate {
  readonly approvedOnSpecNumber: number;
  readonly specNumber:           number;
  readonly specChanges:          readonly BoardLineChange[];
}

export interface BoardTicketDocument {
  readonly document:        BoardTicketDocumentKind;
  readonly standing:        BoardDocumentStanding;
  readonly reviewer:        BoardDocumentApprover;
  readonly holdsAcceptance: boolean;
  readonly editable:        boolean;
  readonly proposalMode:    BoardProposalMode;
  readonly head:            BoardDocumentVersion | null;
  /** The head's source text, agent-written: drawn as text, never as HTML. */
  readonly markdown:        string;
  readonly versions:        readonly BoardDocumentVersion[];
  readonly approvals:       readonly BoardDocumentApproval[];
  readonly messages:        readonly BoardDocumentMessage[];
  readonly proposals:       readonly BoardDocumentProposal[];
  readonly agentJobId:      string | null;
  readonly outOfDate:       BoardDocumentOutOfDate | null;
}

export interface BoardEffectReference {
  readonly reference: number;
  readonly lines:     BoardLineRange;
  readonly quote:     string;
}

export interface BoardEffectEntry {
  readonly reference:        number;
  readonly path:             string;
  readonly change:           BoardEffectChange;
  readonly detail:           string;
  readonly unresolvedReason: BoardEffectUnresolvedReason | null;
  readonly candidates:       readonly string[];
}

export interface BoardEffectReading {
  readonly document:             BoardTicketDocumentKind;
  readonly versionNumber:        number;
  readonly state:                BoardEffectReadingState;
  readonly durationMilliseconds: number | null;
  readonly references:           readonly BoardEffectReference[];
  readonly entries:              readonly BoardEffectEntry[];
}

export interface BoardTicketDocuments {
  readonly ticketId:       string;
  readonly documents:      readonly BoardTicketDocument[];
  readonly effectReadings: readonly BoardEffectReading[];
}
