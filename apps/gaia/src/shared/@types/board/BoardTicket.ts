/**
 * A forge's board page as Gaia holds it: every ticket with the facts and offers the forge serves for it, the task rows, the worded log, the
 * epics, the open filing drafts, and the facts of each row and ticket. Where the forge leaves a field out, the model holds `null` or an
 * empty list.
 */
import type {
  BoardDisplayState,
  BoardDocumentStanding,
  BoardDraftState,
  BoardOfferedCommandKind,
  BoardHephaestusSetting,
  BoardTaskStatus,
  BoardTicketPriority,
  BoardTicketSize,
  BoardTicketStage,
  BoardTicketStatus,
  BoardTicketType,
} from './BoardVocabulary.ts';

/** A `##` section of a ticket body as source text, shown escaped. */
export interface BoardTicketSection {
  readonly heading:  string;
  readonly markdown: string;
}

export interface BoardAcceptanceItem {
  readonly label:  string;
  readonly text:   string;
  readonly waived: boolean;
}

/** What the forge serves in place of a view's own rule over a ticket's status, priority and row. */
export interface BoardTicketFacts {
  readonly resolvedPriority:     BoardTicketPriority;
  readonly settlesADependency:   boolean;
  readonly isClosed:             boolean;
  readonly noAgentHasPickedItUp: boolean;
  readonly reviewRound:          number | null;
  readonly isRepeatReview:       boolean;
}

/** The command kinds the ticket accepts now, and the priorities it may move to. */
export interface BoardTicketOffers {
  readonly kinds:           readonly BoardOfferedCommandKind[];
  readonly priorityChoices: readonly BoardTicketPriority[];
}

/** Where one ticket document stands; a `null` number while it has no version, or no approval. */
export interface BoardTicketDocumentSummary {
  readonly standing:       BoardDocumentStanding;
  readonly headNumber:     number | null;
  readonly approvedNumber: number | null;
}

/** `buildHeld` while the documents keep a committed ticket from its build. */
export interface BoardTicketDocumentsSummary {
  readonly spec:      BoardTicketDocumentSummary;
  readonly plan:      BoardTicketDocumentSummary;
  readonly buildHeld: boolean;
}

export interface BoardTicket {
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
  /** The body's Markdown as the forge serves it; agent-written, so the page contract carries it rendered with its raw HTML escaped. */
  readonly bodyMarkdown:    string;
  readonly sections:        readonly BoardTicketSection[];
  readonly acceptanceItems: readonly BoardAcceptanceItem[];
  readonly facts:           BoardTicketFacts;
  readonly offers:          BoardTicketOffers;
  /** Present only on a ticket in the spec-then-plan route. */
  readonly documents?:      BoardTicketDocumentsSummary;
}

export interface BoardTaskPhase {
  readonly status: BoardTaskStatus;
  readonly at:     string;
}

/** A ticket's own row, a review bar of a ticket, or a free-standing task. */
export interface BoardTask {
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
  readonly history:        readonly BoardTaskPhase[] | null;
  readonly reviewOf:       string | null;
  readonly reviewBarRound: number | null;
}

/** A log record worded for people; a note carries no id lists, so they are `null` there. */
export interface BoardLogEntry {
  readonly at:        string;
  readonly text:      string;
  readonly taskIds:   readonly number[] | null;
  readonly ticketIds: readonly string[] | null;
}

export type BoardViewRange =
  | { readonly kind: 'auto' }
  | { readonly kind: 'absolute' | 'relative'; readonly from: string; readonly to: string; readonly tickMinutes: number | null };

export interface BoardProgress {
  readonly startedAt:         string;
  readonly view:              BoardViewRange;
  readonly hephaestusSetting: BoardHephaestusSetting;
  readonly tasks:             readonly BoardTask[];
  readonly log:               readonly BoardLogEntry[];
}

/** One per task row, at the same index. */
export interface BoardRowFacts {
  readonly displayState:                   BoardDisplayState;
  readonly deliveredRowCountsAsReviewed:   boolean;
  readonly ownRowPositionOfReviewedTicket: number | null;
}

export interface BoardTicketStageFacts {
  readonly name:   BoardTicketStage;
  readonly entity: string;
}

export interface BoardPageTicketFacts {
  readonly ticketId:           string;
  readonly ownRowPosition:     number | null;
  readonly reviewBarPositions: readonly number[];
  readonly displayState:       BoardDisplayState;
  readonly waitingOnTicketIds: readonly string[];
  readonly entity:             string | null;
  readonly stage:              BoardTicketStageFacts | null;
}

export interface BoardEpicSpan {
  readonly start: string;
  readonly end:   string | null;
}

export interface BoardEpic {
  readonly key:                 string;
  readonly title:               string;
  readonly slot:                number;
  readonly ticketIds:           readonly string[];
  readonly ticketCountByStatus: Readonly<Record<BoardTicketStatus, number>>;
  readonly tokens:              number;
  readonly span:                BoardEpicSpan | null;
}

export interface BoardEpicDescription {
  readonly key:                 string;
  readonly descriptionMarkdown: string;
}

export interface BoardReadyTicket {
  readonly id:     string;
  readonly isHeld: boolean;
}

export interface BoardQuestionOption {
  readonly letter: string;
  readonly text:   string;
}

/** The chosen letters in the order given, or free text: never both. */
export type BoardQuestionAnswer =
  | { readonly form: 'letters'; readonly letters: readonly string[]; readonly answeredAt: string }
  | { readonly form: 'text'; readonly text: string; readonly answeredAt: string };

export interface BoardDraftQuestion {
  readonly id:          string;
  readonly question:    string;
  readonly context:     string;
  readonly options:     readonly BoardQuestionOption[];
  readonly multiple:    boolean;
  readonly recommended: readonly string[];
  readonly answer:      BoardQuestionAnswer | null;
  readonly followUps:   readonly BoardDraftQuestion[];
}

/** An open filing draft, no ticket yet, with its whole question tree. */
export interface BoardFilingDraft {
  readonly id:                string;
  readonly title:             string;
  readonly claimOwner:        string | null;
  readonly openedAt:          string;
  readonly state:             BoardDraftState;
  readonly openQuestionCount: number;
  readonly questions:         readonly BoardDraftQuestion[];
}

export interface BoardDraftRequest {
  readonly id:      string;
  readonly request: string;
}

export interface BoardPageFacts {
  readonly rows:         readonly BoardRowFacts[];
  readonly tickets:      readonly BoardPageTicketFacts[];
  readonly epics:        readonly BoardEpic[];
  readonly readyTickets: readonly BoardReadyTicket[];
  readonly drafts:       readonly BoardFilingDraft[];
}

export interface BoardPage {
  readonly progress:         BoardProgress;
  readonly epicDescriptions: readonly BoardEpicDescription[];
  readonly draftRequests:    readonly BoardDraftRequest[];
  readonly facts:            BoardPageFacts;
  readonly tickets:          readonly BoardTicket[];
}
