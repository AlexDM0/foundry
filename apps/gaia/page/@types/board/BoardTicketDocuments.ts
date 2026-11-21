/**
 * A forge's board page as the page reads it: every ticket with the facts and offers the forge serves for it, the task rows, the worded log,
 * the epics, the open filing drafts, and the facts of each row and ticket. Where the forge leaves a field out, it holds `null` or an empty
 * list.
 */
import type {
  BoardDisplayState,
  BoardDraftState,
  BoardOfferedCommandKind,
  BoardOverseerSetting,
  BoardTaskStatus,
  BoardTicketPriority,
  BoardTicketSize,
  BoardTicketStage,
  BoardTicketStatus,
  BoardTicketType,
} from './BoardVocabulary.ts';

/** A `##` section of a ticket body as source text, shown escaped. */
export interface BoardTicketSectionDocument {
  readonly heading:  string;
  readonly markdown: string;
}

export interface BoardAcceptanceItemDocument {
  readonly label:  string;
  readonly text:   string;
  readonly waived: boolean;
}

/** What the forge serves in place of a view's own rule over a ticket's status, priority and row. */
export interface BoardTicketFactsDocument {
  readonly resolvedPriority:     BoardTicketPriority;
  readonly settlesADependency:   boolean;
  readonly isClosed:             boolean;
  readonly noAgentHasPickedItUp: boolean;
  readonly reviewRound:          number | null;
  readonly isRepeatReview:       boolean;
}

/** The command kinds the ticket accepts now, and the priorities it may move to. */
export interface BoardTicketOffersDocument {
  readonly kinds:           readonly BoardOfferedCommandKind[];
  readonly priorityChoices: readonly BoardTicketPriority[];
}

export interface BoardTicketDocument {
  readonly id:              string;
  readonly title:           string;
  readonly type:            BoardTicketType;
  readonly status:          BoardTicketStatus;
  /** As filed; `resolvedPriority` in `facts` is the one it runs at. */
  readonly priority:        BoardTicketPriority | null;
  readonly size:            BoardTicketSize | null;
  /** The hold's reason, empty when none was given; `null` while no hold holds the ticket. */
  readonly hold:            string | null;
  readonly epics:           readonly string[];
  readonly group:           string | null;
  readonly releasesGroup:   boolean;
  readonly dependsOn:       readonly string[];
  readonly branch:          string | null;
  readonly commit:          string | null;
  readonly reason:          string | null;
  readonly network:         readonly string[];
  readonly entity:          string | null;
  readonly crosses:         readonly string[];
  /** The delivered ticket whose change let this bug out, `null` when the bug names none. */
  readonly introducedBy:    string | null;
  /** The review whose finding filed this ticket, `null` when no review filed it. */
  readonly foundInReview:   string | null;
  readonly filedByJob:      string | null;
  readonly task:            number | null;
  readonly filed:           string;
  readonly updated:         string;
  readonly started:         string | null;
  readonly finished:        string | null;
  readonly delivered:       string | null;
  readonly abandonedAt:     string | null;
  /** Agent-written markup: shown only inside a sandboxed frame. */
  readonly bodyHtml:        string;
  readonly sections:        readonly BoardTicketSectionDocument[];
  readonly acceptanceItems: readonly BoardAcceptanceItemDocument[];
  readonly facts:           BoardTicketFactsDocument;
  readonly offers:          BoardTicketOffersDocument;
}

export interface BoardTaskPhaseDocument {
  readonly status: BoardTaskStatus;
  readonly at:     string;
}

/** A ticket's own row, a review bar of a ticket, or a free-standing task. */
export interface BoardTaskDocument {
  readonly id:             number;
  readonly name:           string;
  readonly status:         BoardTaskStatus;
  readonly start:          string | null;
  readonly end:            string | null;
  readonly owner:          string;
  readonly note:           string;
  readonly ticket:         string | null;
  readonly tokens:         number | null;
  readonly reviewed:       string | null;
  readonly reviewRound:    number | null;
  /** `null` on a row filed before phases were kept. */
  readonly history:        readonly BoardTaskPhaseDocument[] | null;
  readonly reviewOf:       string | null;
  readonly reviewBarRound: number | null;
}

/** A log record worded for people; a note carries no id lists, so they are `null` there. */
export interface BoardLogEntryDocument {
  readonly at:        string;
  readonly text:      string;
  readonly taskIds:   readonly number[] | null;
  readonly ticketIds: readonly string[] | null;
}

export type BoardViewRangeDocument =
  | { readonly kind: 'auto' }
  | { readonly kind: 'absolute' | 'relative'; readonly from: string; readonly to: string; readonly tickMinutes: number | null };

export interface BoardProgressDocument {
  readonly startedAt:       string;
  readonly view:            BoardViewRangeDocument;
  readonly overseerSetting: BoardOverseerSetting;
  readonly tasks:           readonly BoardTaskDocument[];
  readonly log:             readonly BoardLogEntryDocument[];
}

/** One per task row, at the same index. */
export interface BoardRowFactsDocument {
  readonly displayState:                   BoardDisplayState;
  readonly deliveredRowCountsAsReviewed:   boolean;
  readonly ownRowPositionOfReviewedTicket: number | null;
}

export interface BoardTicketStageFactsDocument {
  readonly name:   BoardTicketStage;
  readonly entity: string;
}

export interface BoardPageTicketFactsDocument {
  readonly ticketId:           string;
  readonly ownRowPosition:     number | null;
  readonly reviewBarPositions: readonly number[];
  readonly displayState:       BoardDisplayState;
  readonly waitingOnTicketIds: readonly string[];
  readonly entity:             string | null;
  readonly stage:              BoardTicketStageFactsDocument | null;
}

export interface BoardEpicSpanDocument {
  readonly start: string;
  readonly end:   string | null;
}

export interface BoardEpicDocument {
  readonly key:                 string;
  readonly title:               string;
  readonly slot:                number;
  readonly ticketIds:           readonly string[];
  readonly ticketCountByStatus: Readonly<Record<BoardTicketStatus, number>>;
  readonly tokens:              number;
  readonly span:                BoardEpicSpanDocument | null;
}

export interface BoardEpicDescriptionDocument {
  readonly key:             string;
  readonly descriptionHtml: string;
}

export interface BoardReadyTicketDocument {
  readonly id:     string;
  readonly isHeld: boolean;
}

export interface BoardQuestionOptionDocument {
  readonly letter: string;
  readonly text:   string;
}

/** The chosen letters in the order given, or free text: never both. */
export type BoardQuestionAnswerDocument =
  | { readonly form: 'letters'; readonly letters: readonly string[]; readonly answeredAt: string }
  | { readonly form: 'text'; readonly text: string; readonly answeredAt: string };

export interface BoardDraftQuestionDocument {
  readonly id:          string;
  readonly question:    string;
  readonly context:     string;
  readonly options:     readonly BoardQuestionOptionDocument[];
  readonly multiple:    boolean;
  readonly recommended: readonly string[];
  readonly answer:      BoardQuestionAnswerDocument | null;
  readonly followUps:   readonly BoardDraftQuestionDocument[];
}

/** An open filing draft, no ticket yet, with its whole question tree. */
export interface BoardFilingDraftDocument {
  readonly id:                string;
  readonly title:             string;
  readonly claimOwner:        string | null;
  readonly openedAt:          string;
  readonly state:             BoardDraftState;
  readonly openQuestionCount: number;
  readonly questions:         readonly BoardDraftQuestionDocument[];
}

export interface BoardDraftRequestDocument {
  readonly id:      string;
  readonly request: string;
}

export interface BoardPageFactsDocument {
  readonly rows:         readonly BoardRowFactsDocument[];
  readonly tickets:      readonly BoardPageTicketFactsDocument[];
  readonly epics:        readonly BoardEpicDocument[];
  readonly readyTickets: readonly BoardReadyTicketDocument[];
  readonly drafts:       readonly BoardFilingDraftDocument[];
}

export interface BoardPageDocument {
  readonly progress:         BoardProgressDocument;
  readonly epicDescriptions: readonly BoardEpicDescriptionDocument[];
  readonly draftRequests:    readonly BoardDraftRequestDocument[];
  readonly facts:            BoardPageFactsDocument;
  readonly tickets:          readonly BoardTicketDocument[];
}
