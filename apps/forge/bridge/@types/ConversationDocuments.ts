/**
 * The fields of the Overseer's `BoardState` the Questions, Assistant and Intake views and the question panel read: open decisions and
 * incidents, the session jobs, the tickets, the notices, the picture limits, and `questionHistory`, the log records a settled decision,
 * incident or ended session leaves behind. Written structurally here, since the Bridge's project compiles no tracker-model file.
 */
import type { PageDraftDocument } from './BoardStateDocument.ts';


/** An option of a question; what it touches, trades off and does to the Acceptance only once the asking agent noted them. */
export interface DecisionOptionDocument {
  /** As asked, with no mark of the recommendation, which `isRecommended` carries. */
  readonly label:             string;
  readonly description:       string;
  readonly isRecommended:     boolean;
  /** The repository paths the option changes. */
  readonly touches?:          readonly string[];
  readonly tradeOff?:         string;
  /** What the option does to the ticket's Acceptance items, by their labels, such as "A2 fails". */
  readonly acceptanceEffect?: string;
}

export interface DecisionQuestionDocument {
  readonly question:    string;
  readonly header:      string;
  readonly multiSelect: boolean;
  readonly options:     readonly DecisionOptionDocument[];
}

export interface DecisionDocument {
  readonly id:        string;
  readonly kind:      string;
  readonly ticketIds: readonly string[];
  readonly jobId:     string | null;
  readonly askedBy:   string;
  readonly questions: readonly DecisionQuestionDocument[];
  readonly context:   string;
  readonly openedAt:  string;
}

/** The Assistant's chat an incident went out in. */
export interface IncidentDeliveryTurnDocument {
  readonly jobId:        string;
  readonly chatSequence: number;
}

export interface IncidentDocument {
  readonly id:              string;
  readonly kind:            string;
  readonly ticketIds:       readonly string[];
  readonly jobId:           string | null;
  readonly facts:           Readonly<Record<string, string>>;
  readonly defaultMove:     string;
  /** `null` while the incident waits for an Assistant's chat. */
  readonly deliveredInTurn: IncidentDeliveryTurnDocument | null;
  readonly openedAt:        string;
}

/** Whether a message sent now reaches the session between turns or waits behind the turn under way. */
export type SessionTurnDocument = 'between-turns' | 'mid-turn';

/** The newest line the session or User said, which the Intake list shows under a session. */
export interface SessionLastLineDocument {
  readonly role: 'assistant' | 'user';
  readonly text: string;
  readonly at:   string | null;
}

/**
 * The live facts of a session job the Assistant and Intake views read: its API turns so far, its turn, User's messages it has not taken
 * yet, and its last line.
 */
export interface SessionLiveFactsDocument {
  readonly calls:           number;
  /** `null` before its first child logged a line. */
  readonly turn:            SessionTurnDocument | null;
  readonly messagesWaiting: number;
  /** `null` before the session or User said a line. */
  readonly lastLine?:       SessionLastLineDocument | null;
}

/** A product-owner job's intake: User's request and, once the product owner gave one, its short title. */
export interface SessionIntakeDocument {
  readonly text:   string;
  readonly title?: string;
}

export interface SessionJobDocument {
  readonly id:        string;
  readonly kind:      string;
  readonly ticketIds: readonly string[];
  readonly state:     string;
  readonly intake?:   SessionIntakeDocument;
  readonly live?:     SessionLiveFactsDocument;
}

/** What a message or an intake request may carry; served only while the agent takes pictures. */
export interface PictureLimitsDocument {
  readonly perMessage:     number;
  readonly sizeLimitBytes: number;
  readonly mediaTypes:     readonly string[];
}

/** A `##` section of a ticket body as source text, which a view shows escaped, never as HTML. */
export interface TicketSectionDocument {
  readonly heading:  string;
  readonly markdown: string;
}

/** A numbered Acceptance item as text; `waived` when the Acceptance marks it `Waived:`. */
export interface AcceptanceItemDocument {
  readonly label:  string;
  readonly text:   string;
  readonly waived: boolean;
}

export interface TicketDocument {
  readonly id:               string;
  readonly title:            string;
  readonly status:           string;
  readonly hold?:            string;
  readonly priority?:        string;
  readonly filedByJob?:      string;
  readonly epics?:           readonly string[];
  readonly sections?:        readonly TicketSectionDocument[];
  readonly acceptanceItems?: readonly AcceptanceItemDocument[];
}

export interface NoticeDocument {
  readonly kind:           string;
  readonly [fact: string]: unknown;
}

/** One log record as stored: its kind, stamp, subject id beside them, and its fields. */
export interface HistoryRecordDocument {
  readonly kind:        string;
  readonly at:          string;
  readonly jobId?:      string;
  readonly ticketId?:   string;
  readonly decisionId?: string;
  readonly incidentId?: string;
  readonly fields:      Readonly<Record<string, unknown>>;
}

export interface ConversationBoardDocument {
  readonly jobs:      readonly SessionJobDocument[];
  readonly decisions: readonly DecisionDocument[];
  readonly incidents: readonly IncidentDocument[];
  readonly notices?:  readonly NoticeDocument[];
  readonly page?:            {
    readonly tickets:  readonly TicketDocument[];
    /** The open filing drafts, as far as the intake chat reads them for Flint. */
    readonly payload?: { readonly boardFacts: { readonly drafts?: readonly PageDraftDocument[] } };
  };
  readonly questionHistory?: readonly HistoryRecordDocument[];
  /** `null` or absent: no picture can be sent. */
  readonly pictureLimits?:   PictureLimitsDocument | null;
}
