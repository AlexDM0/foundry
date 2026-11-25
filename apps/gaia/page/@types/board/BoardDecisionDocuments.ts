/**
 * The open decisions of a forge's board as the page reads them, the questions the user answers, and the records a settled decision,
 * incident or session job left in the log.
 */
import type { BoardTicketDocumentKind }                            from './BoardVocabulary.ts';
import type { BoardCommentAnchorDocument, BoardLineRangeDocument } from './TicketDocumentsDocument.ts';

/** An option as asked: its label carries no mark of the recommendation, which `recommended` carries. */
export interface BoardDecisionOptionDocument {
  /** The letter an answer names the option by, `a` for the first, as the forge takes it. */
  readonly letter:           string;
  readonly label:            string;
  readonly description:      string;
  readonly recommended:      boolean;
  readonly touches:          readonly string[];
  readonly tradeOff:         string | null;
  readonly acceptanceEffect: string | null;
}

export interface BoardDecisionQuestionDocument {
  readonly question:    string;
  readonly header:      string;
  readonly multiSelect: boolean;
  readonly options:     readonly BoardDecisionOptionDocument[];
}

export interface BoardDecisionDocument {
  readonly id:        string;
  readonly kind:      string;
  readonly ticketIds: readonly string[];
  readonly jobId:     string | null;
  readonly askedBy:   string;
  readonly questions: readonly BoardDecisionQuestionDocument[];
  readonly context:   string;
  readonly openedAt:  string;
  /** The document a spec or plan agent asked on; `null` on any other decision, and then `anchor` and `placement` are `null` too. */
  readonly document:  BoardTicketDocumentKind | null;
  /** The lines the question changes, at the version the agent read. */
  readonly anchor:    BoardCommentAnchorDocument | null;
  /** The anchor's lines at the document's head now; `null` once they are gone. */
  readonly placement: BoardLineRangeDocument | null;
}

/** One record a settled decision or incident, or a session job, left in the log, with its fields as stored. */
export interface BoardQuestionHistoryEntryDocument {
  readonly kind:       string;
  readonly at:         string;
  readonly jobId:      string | null;
  readonly ticketId:   string | null;
  readonly decisionId: string | null;
  readonly incidentId: string | null;
  readonly fields:     Readonly<Record<string, unknown>>;
}
