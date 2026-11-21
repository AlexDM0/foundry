/**
 * The open decisions of a forge's board as the page reads them, the questions the user answers, and the records a settled decision,
 * incident or session job left in the log.
 */

/** An option as asked: its label carries no mark of the recommendation, which `recommended` carries. */
export interface BoardDecisionOptionDocument {
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
