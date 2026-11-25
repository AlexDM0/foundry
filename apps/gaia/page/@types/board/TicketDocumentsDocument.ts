/**
 * A ticket's spec and plan as the page reads them: each document with the forge's fields mapped, its head's Markdown as source text and no
 * rendered form, and the newest effect reading of each. The page parses the Markdown itself and draws it as text, never as HTML.
 */
import type { PAGE_CONTRACT_VERSIONS } from '../../../src/shared/constants/PageContractVersions.ts';
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

export interface BoardLineRangeDocument {
  readonly from: number;
  readonly to:   number;
}

export interface BoardColumnRangeDocument {
  readonly from: number;
  readonly to:   number;
}

export interface BoardDocumentVersionDocument {
  readonly number:             number;
  readonly contentHash:        string;
  readonly author:             BoardDocumentAuthor;
  readonly jobId:              string | null;
  readonly at:                 string;
  readonly constitutionCommit: string | null;
  readonly constitutionNumber: number | null;
}

export interface BoardDocumentApprovalDocument {
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

export interface BoardDiagramAnchorDocument {
  readonly lines:       BoardLineRangeDocument;
  readonly diagramKind: string;
  readonly nodeId:      string;
  readonly nodeLabel:   string;
}

/** Where a comment was made, as sent. */
export interface BoardCommentAnchorDocument {
  readonly view:             BoardCommentView;
  readonly versionNumber:    number;
  readonly lines:            BoardLineRangeDocument;
  readonly columns:          BoardColumnRangeDocument | null;
  readonly sectionPath:      readonly string[];
  readonly quote:            string | null;
  readonly surroundingLines: BoardLineRangeDocument;
  readonly diagram:          BoardDiagramAnchorDocument | null;
}

/** User's answer to the document agent's question in parts: its question, the chosen option's label and User's own words. */
export interface BoardDocumentAnswerDocument {
  readonly question: string;
  /** `null` for an answer of free text alone. */
  readonly choice:   string | null;
  /** The note beside the option, or the free text; `null` with neither. */
  readonly note:     string | null;
}

export interface BoardDocumentMessageDocument {
  readonly messageId:      string;
  readonly commentNumber:  number | null;
  /** The decision this message answers, the document agent's own question, anchored where the question was; `null` on any other. */
  readonly decisionId:     string | null;
  /** The answer in parts, with `decisionId`. */
  readonly answer:         BoardDocumentAnswerDocument | null;
  readonly anchor:         BoardCommentAnchorDocument | null;
  /** The anchor's lines at the head version; `null` when unanchored or orphaned. */
  readonly placement:      BoardLineRangeDocument | null;
  readonly orphaned:       boolean;
  readonly text:           string;
  readonly from:           BoardDocumentMessageSender;
  readonly state:          BoardDocumentMessageState;
  readonly queuedAt:       string;
  readonly deliveryNumber: number | null;
  readonly agentTurn:      number | null;
}

export interface BoardLineEditDocument {
  readonly fromLine:         number;
  readonly toLine:           number;
  readonly originalLines:    readonly string[];
  readonly replacementLines: readonly string[];
}

export interface BoardDocumentProposalDocument {
  readonly proposalId:       string;
  readonly jobId:            string;
  readonly baseNumber:       number | null;
  readonly edits:            readonly BoardLineEditDocument[];
  readonly summary:          string;
  readonly answersMessageId: string | null;
  readonly forSpecNumber:    number | null;
  readonly state:            BoardDocumentProposalState;
  readonly appliedNumber:    number | null;
  readonly at:               string;
  readonly headLines:        BoardLineRangeDocument | null;
}

export interface BoardLineChangeDocument {
  readonly originalFromLine:    number;
  readonly originalLines:       readonly string[];
  readonly replacementFromLine: number;
  readonly replacementLines:    readonly string[];
}

export interface BoardDocumentOutOfDateDocument {
  readonly approvedOnSpecNumber: number;
  readonly specNumber:           number;
  readonly specChanges:          readonly BoardLineChangeDocument[];
}

export interface BoardTicketDocumentDocument {
  readonly document:        BoardTicketDocumentKind;
  readonly standing:        BoardDocumentStanding;
  readonly reviewer:        BoardDocumentApprover;
  readonly holdsAcceptance: boolean;
  readonly editable:        boolean;
  readonly proposalMode:    BoardProposalMode;
  readonly head:            BoardDocumentVersionDocument | null;
  /** The head's source text, agent-written: drawn as text, never as HTML. */
  readonly markdown:        string;
  readonly versions:        readonly BoardDocumentVersionDocument[];
  readonly approvals:       readonly BoardDocumentApprovalDocument[];
  readonly messages:        readonly BoardDocumentMessageDocument[];
  readonly proposals:       readonly BoardDocumentProposalDocument[];
  readonly agentJobId:      string | null;
  readonly outOfDate:       BoardDocumentOutOfDateDocument | null;
}

export interface BoardEffectReferenceDocument {
  readonly reference: number;
  readonly lines:     BoardLineRangeDocument;
  readonly quote:     string;
}

export interface BoardEffectEntryDocument {
  readonly reference:        number;
  readonly path:             string;
  readonly change:           BoardEffectChange;
  readonly detail:           string;
  readonly unresolvedReason: BoardEffectUnresolvedReason | null;
  readonly candidates:       readonly string[];
}

export interface BoardEffectReadingDocument {
  readonly document:             BoardTicketDocumentKind;
  readonly versionNumber:        number;
  readonly state:                BoardEffectReadingState;
  readonly durationMilliseconds: number | null;
  readonly references:           readonly BoardEffectReferenceDocument[];
  readonly entries:              readonly BoardEffectEntryDocument[];
}

/** `GET /api/v1/forges/{forgeId}/tickets/{ticketId}/documents`: Gaia's own contract, never the forge's. */
export interface GaiaTicketDocumentsDocument {
  readonly ticketDocumentsVersion: typeof PAGE_CONTRACT_VERSIONS.gaiaTicketDocuments;
  readonly ticketId:               string;
  readonly documents:              readonly BoardTicketDocumentDocument[];
  readonly effectReadings:         readonly BoardEffectReadingDocument[];
}
