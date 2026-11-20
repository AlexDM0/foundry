/**
 * The board document's `page`: every ticket with its frontmatter and its body, the task rows, the worded log, the epics, the open filing
 * drafts, and the Board's facts of each row and ticket, so a view draws the tickets, the chart and the epics without a rule of its own.
 */
import type {
  DisplayState,
  DraftState,
  EntityKey,
  TaskStatus,
  TicketPriority,
  TicketSize,
  TicketStageName,
  TicketStatus,
  TicketType
} from '../constants/BoardVocabulary.ts';
import type { BoardTicketFactsDocument, BoardTicketOffersDocument } from './BoardReadingDocuments.ts';


/** A `##` section of a ticket body as source text, which a view shows escaped, never as HTML. */
export interface BoardTicketSectionDocument {
  readonly heading:  string;
  readonly markdown: string;
}

/** A numbered Acceptance item as text; `waived` when the Acceptance marks it `Waived:`. */
export interface BoardAcceptanceItemDocument {
  readonly label:  string;
  readonly text:   string;
  readonly waived: boolean;
}

/** A ticket as filed. An optional field is absent where the ticket names nothing; an absent `priority` reads as `normal`. */
export interface BoardTicketDocument {
  readonly id:              string;
  readonly title:           string;
  readonly type:            TicketType;
  readonly status:          TicketStatus;
  readonly priority?:       TicketPriority;
  readonly size?:           TicketSize;
  /** Present while a hold holds the ticket, holding its reason, empty when none was given. */
  readonly hold?:           string;
  /** The keys of the epics the ticket belongs to, its primary epic first. */
  readonly epics?:          readonly string[];
  readonly group?:          string;
  /** Present only on the one ticket of its group whose delivery releases the group. */
  readonly releasesGroup?:  true;
  /** The ids of the tickets this one waits on, in the order written. */
  readonly dependsOn?:      readonly string[];
  readonly branch?:         string;
  readonly commit?:         string;
  /** Why an abandoned ticket was abandoned. */
  readonly reason?:         string;
  /** The public domains the ticket's agents may reach. */
  readonly network?:        readonly string[];
  /** On a forge with entities, once the ticket names the entity whose pipeline builds it. */
  readonly entity?:         EntityKey;
  /** The packages intake expects the ticket to cross into: a forecast only. */
  readonly crosses?:        readonly EntityKey[];
  /** On a bug only: the delivered ticket whose change introduced it. */
  readonly introducedBy?:   string;
  /** The ticket whose review found this one. */
  readonly foundInReview?:  string;
  /** The job that filed the ticket. */
  readonly filedByJob?:     string;
  /** The id of the ticket's own task row; `null` while it has none. */
  readonly task:            number | null;
  readonly filed:           string;
  readonly updated:         string;
  readonly started:         string | null;
  readonly finished:        string | null;
  readonly delivered:       string | null;
  readonly abandonedAt:     string | null;
  /** The body as marked output: agent-written, so a view shows it only inside a sandboxed frame. */
  readonly bodyHtml:        string;
  readonly sections:        readonly BoardTicketSectionDocument[];
  /** Empty when the body has no `## Acceptance` or it numbers no item. */
  readonly acceptanceItems: readonly BoardAcceptanceItemDocument[];
  readonly facts:           BoardTicketFactsDocument;
  readonly offers:          BoardTicketOffersDocument;
}

/** One status a row reached, and when. */
export interface BoardTaskPhaseDocument {
  readonly status: TaskStatus;
  readonly at:     string;
}

/** A task row: a ticket's own row, a review bar of a ticket, or a free-standing task. */
export interface BoardTaskDocument {
  readonly id:              number;
  readonly name:            string;
  readonly status:          TaskStatus;
  readonly start:           string | null;
  readonly end:             string | null;
  readonly owner:           string;
  readonly note:            string;
  /** The ticket this row belongs to; `null` for a free-standing task. */
  readonly ticket:          string | null;
  /** `null` when nobody reported a figure; `0` is an answer. */
  readonly tokens:          number | null;
  /** When the row first reached `reviewed`; kept through delivery. */
  readonly reviewed?:       string;
  /** Which review pass the row is in, counted from the second. */
  readonly reviewRound?:    number;
  /** The phases the row went through, oldest first; absent on a row filed before phases were kept. */
  readonly history?:        readonly BoardTaskPhaseDocument[];
  /** On a review bar: the ticket it reviews, whose own row it is drawn above. */
  readonly reviewOf?:       string;
  /** On a review bar: which review of its ticket it is, from 1. */
  readonly reviewBarRound?: number;
}

/** A log record worded for people. One worded from a record carries both id lists, empty when it concerns none; a note carries neither. */
export interface BoardLogEntryDocument {
  readonly at:         string;
  readonly text:       string;
  readonly taskIds?:   readonly number[];
  readonly ticketIds?: readonly string[];
}

/** The chart's range as the user last set it: a `relative` range's ends stay as written (`-2h`, `start`, `now`). */
export type BoardViewRangeDocument =
  | { readonly kind: 'auto' }
  | { readonly kind: 'absolute'; readonly from: string; readonly to: string; readonly tickMinutes: number | null }
  | { readonly kind: 'relative'; readonly from: string; readonly to: string; readonly tickMinutes: number | null };

/** Where the user left the board: `paused` starts no new job until the user's go. */
export type BoardOverseerSetting = 'running' | 'paused';

export interface BoardProgressDocument {
  readonly startedAt:     string;
  readonly view:          BoardViewRangeDocument;
  readonly overseerState: BoardOverseerSetting;
  readonly tasks:         readonly BoardTaskDocument[];
  readonly log:           readonly BoardLogEntryDocument[];
}

/** One per row of `progress.tasks`, at the same index. */
export interface BoardRowFactsDocument {
  readonly displayState:                   DisplayState;
  readonly deliveredRowCountsAsReviewed:   boolean;
  /** For a review bar: where its ticket's own row is in `progress.tasks`; `null` for every other row. */
  readonly ownRowPositionOfReviewedTicket: number | null;
}

/** The stage a crossing ticket is in, and the entity whose agent runs it: the ticket's home entity, or the crossed package. */
export interface BoardTicketStageDocument {
  readonly name:   TicketStageName;
  readonly entity: EntityKey;
}

/** The Board's facts of one ticket, joined to the ticket by `ticketId`. */
export interface BoardPageTicketFactsDocument {
  readonly ticketId:           string;
  readonly ownRowPosition:     number | null;
  /** Oldest filed first. */
  readonly reviewBarPositions: readonly number[];
  readonly displayState:       DisplayState;
  /** Empty for a closed ticket and for one whose dependencies are all settled. */
  readonly waitingOnTicketIds: readonly string[];
  /** On a forge with entities, once the ticket names its entity. */
  readonly entity?:            EntityKey;
  /** The stage a crossing ticket is in; absent on a ticket that crosses into no package. */
  readonly stage?:             BoardTicketStageDocument;
}

/** From the epic's first start to its last end, the end `null` while any of its work is open. */
export interface BoardEpicSpanDocument {
  readonly start: string;
  readonly end:   string | null;
}

export interface BoardEpicRollupDocument {
  readonly key:                 string;
  readonly title:               string;
  readonly slot:                number;
  /** Every ticket naming the epic, in ticket id order. */
  readonly ticketIds:           readonly string[];
  readonly ticketCountByStatus: Readonly<Record<TicketStatus, number>>;
  readonly tokens:              number;
  /** `null` while none of its rows has started. */
  readonly span:                BoardEpicSpanDocument | null;
}

/** An epic's description rendered as a ticket body is, joined to its roll-up by key. */
export interface BoardEpicDescriptionDocument {
  readonly key:             string;
  readonly descriptionHtml: string;
}

/** A ready ticket, in the order to take them. */
export interface BoardReadyTicketDocument {
  readonly id:    string;
  /** Present only on a held ticket. */
  readonly held?: true;
}

export interface BoardDraftQuestionOptionDocument {
  /** `a` to `d`, in the order the options were given. */
  readonly letter: string;
  readonly text:   string;
}

/** The chosen option letters in the order given, or free text: never both. */
export type BoardDraftAnswerDocument =
  | { readonly letters: readonly string[]; readonly answeredAt: string }
  | { readonly text: string; readonly answeredAt: string };

/** `Q1`, `Q2`, …: a filing draft's question with its follow-ups under it. */
export interface BoardDraftQuestionDocument {
  readonly id:          string;
  readonly question:    string;
  readonly context:     string;
  readonly options:     readonly BoardDraftQuestionOptionDocument[];
  /** A multi-select question's recommendation and answer may name several letters. */
  readonly multiple:    boolean;
  readonly recommended: readonly string[];
  /** `null` while the question is open. */
  readonly answer:      BoardDraftAnswerDocument | null;
  readonly followUps:   readonly BoardDraftQuestionDocument[];
}

/** An open filing draft, which is no ticket yet, with its whole question tree. */
export interface BoardDraftSummaryDocument {
  readonly id:                string;
  readonly title:             string;
  /** `null` while nobody holds the draft. */
  readonly claimOwner:        string | null;
  readonly openedAt:          string;
  readonly state:             DraftState;
  readonly openQuestionCount: number;
  readonly questions:         readonly BoardDraftQuestionDocument[];
}

/** A draft's request in the user's own words, joined to its summary by id. */
export interface BoardDraftRequestDocument {
  readonly id:      string;
  readonly request: string;
}

export interface BoardPageFactsDocument {
  readonly rows:         readonly BoardRowFactsDocument[];
  readonly tickets:      readonly BoardPageTicketFactsDocument[];
  /** Every epic with its roll-up, ordered by key. */
  readonly epics:        readonly BoardEpicRollupDocument[];
  readonly readyTickets: readonly BoardReadyTicketDocument[];
  /** Every open draft, ordered by id. */
  readonly drafts:       readonly BoardDraftSummaryDocument[];
}

export interface BoardPagePayloadDocument {
  readonly progress:         BoardProgressDocument;
  readonly epicDescriptions: readonly BoardEpicDescriptionDocument[];
  /** One per open draft. */
  readonly draftRequests:    readonly BoardDraftRequestDocument[];
  readonly boardFacts:       BoardPageFactsDocument;
}

export interface BoardPageDocument {
  readonly payload: BoardPagePayloadDocument;
  readonly tickets: readonly BoardTicketDocument[];
}
