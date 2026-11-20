/**
 * The board document's conversations: the open decisions for the user, the open incidents for the Assistant, what a settled decision,
 * incident or ended session leaves behind, and what a picture sent with a message may be.
 */

import type { ForgeJsonValue } from './ForgeRefusalDocument.ts';

/** An option of a question; what it touches, trades off and does to the Acceptance only once the asking agent noted them. */
export interface BoardDecisionOptionDocument {
  /** As asked, with no mark of the recommendation, which `recommended` carries. */
  readonly label:             string;
  readonly description:       string;
  /** The asking agent's recommendation, as forge stored it. */
  readonly recommended:       boolean;
  /** The repository paths the option changes. */
  readonly touches?:          readonly string[];
  /** What the user gets and what the user loses. */
  readonly tradeOff?:         string;
  /** What the option does to the ticket's Acceptance items, by their labels, such as "A2 fails". */
  readonly acceptanceEffect?: string;
}

export interface BoardDecisionQuestionDocument {
  readonly question:    string;
  readonly header:      string;
  readonly multiSelect: boolean;
  readonly options:     readonly BoardDecisionOptionDocument[];
}

/** A question for the user; the first answer wins. */
export interface BoardDecisionDocument {
  readonly id:        string;
  readonly kind:      string;
  readonly ticketIds: readonly string[];
  readonly jobId:     string | null;
  /** The asking agent's role; `overseer` for a decision the forge opened from the facts. */
  readonly askedBy:   string;
  readonly questions: readonly BoardDecisionQuestionDocument[];
  readonly context:   string;
  readonly openedAt:  string;
}

/** The Assistant's chat an incident went out in. */
export interface BoardIncidentDeliveryTurnDocument {
  readonly jobId:        string;
  readonly chatSequence: number;
}

/** Operational trouble the forge cannot settle alone, addressed to the Assistant. */
export interface BoardIncidentDocument {
  readonly id:              string;
  readonly kind:            string;
  readonly ticketIds:       readonly string[];
  readonly jobId:           string | null;
  readonly facts:           Readonly<Record<string, string>>;
  /** The move the incident takes when nobody settles it. */
  readonly defaultMove:     string;
  /** `null` while the incident waits for an Assistant's chat. */
  readonly deliveredInTurn: BoardIncidentDeliveryTurnDocument | null;
  readonly openedAt:        string;
}

/**
 * One record a settled decision or incident, or a session job, left in the log: its kind, its stamp, the ids of what it concerns, and its
 * fields as stored.
 */
export interface BoardQuestionHistoryEntryDocument {
  readonly kind:        string;
  readonly at:          string;
  readonly jobId?:      string;
  readonly ticketId?:   string;
  readonly decisionId?: string;
  readonly incidentId?: string;
  readonly fields:      Readonly<Record<string, ForgeJsonValue>>;
}

/** What a message or an intake request may carry. */
export interface BoardPictureLimitsDocument {
  readonly perMessage:     number;
  readonly sizeLimitBytes: number;
  readonly mediaTypes:     readonly string[];
}
