/**
 * The open decisions of a forge's board, the questions the user answers, and the records a settled decision, incident or session job left
 * in the log.
 */
import type { JsonValue }                          from '../../../lib/json-value/JsonValueUtil.ts';
import type { BoardTicketDocumentKind }            from './BoardVocabulary.ts';
import type { BoardCommentAnchor, BoardLineRange } from './TicketDocuments.ts';

/** An option as asked: its label carries no mark of the recommendation, which `recommended` carries. */
export interface BoardDecisionOption {
  /** The letter an answer names the option by, `a` for the first, as the forge takes it. */
  readonly letter:           string;
  readonly label:            string;
  readonly description:      string;
  readonly recommended:      boolean;
  readonly touches:          readonly string[];
  readonly tradeOff:         string | null;
  readonly acceptanceEffect: string | null;
}

export interface BoardDecisionQuestion {
  readonly question:    string;
  readonly header:      string;
  readonly multiSelect: boolean;
  readonly options:     readonly BoardDecisionOption[];
}

export interface BoardDecision {
  readonly id:        string;
  readonly kind:      string;
  readonly ticketIds: readonly string[];
  readonly jobId:     string | null;
  readonly askedBy:   string;
  readonly questions: readonly BoardDecisionQuestion[];
  readonly context:   string;
  readonly openedAt:  string;
  /** The document a spec or plan agent asked on; `null` on any other decision, and then `anchor` and `placement` are `null` too. */
  readonly document:  BoardTicketDocumentKind | null;
  /** The lines the question changes, at the version the agent read. */
  readonly anchor:    BoardCommentAnchor | null;
  /** The anchor's lines at the document's head now; `null` once they are gone. */
  readonly placement: BoardLineRange | null;
}

/** One record a settled decision or incident, or a session job, left in the log, with its fields as stored. */
export interface BoardQuestionHistoryEntry {
  readonly kind:       string;
  readonly at:         string;
  readonly jobId:      string | null;
  readonly ticketId:   string | null;
  readonly decisionId: string | null;
  readonly incidentId: string | null;
  readonly fields:     Readonly<Record<string, JsonValue>>;
}
