/** The fields of the Overseer's `BoardState` the Kanban reads, exactly those, so the state document satisfies it unchanged. */
import type { DraftState }              from '../../src/lib/tracker-model/@types/Draft.ts';
import type { DisplayState, TaskPhase } from '../../src/lib/tracker-model/@types/Task.ts';
import type {
  TicketPriority,
  TicketSize,
  TicketStatus,
  TicketType
} from '../../src/lib/tracker-model/@types/Ticket.ts';
import type { DurationUnits, TimestampSlices } from '../utils/TimeUtil.ts';

export interface KanbanTicketDocument {
  readonly id:          string;
  readonly title:       string;
  readonly type:        TicketType;
  readonly status:      TicketStatus;
  readonly priority?:   TicketPriority;
  readonly size?:       TicketSize;
  readonly hold?:       string;
  readonly epics?:      readonly string[];
  readonly dependsOn?:  readonly string[];
  readonly filed:       string;
  readonly updated:     string;
  readonly started:     string | null;
  readonly finished:    string | null;
  readonly delivered:   string | null;
  readonly abandonedAt: string | null;
  /** Why an abandoned ticket was abandoned; absent when no reason was given. */
  readonly reason?:     string;
}

export interface KanbanTicketFacts {
  readonly ticketId:           string;
  readonly ownRowPosition:     number | null;
  /** Oldest filed first. */
  readonly reviewBarPositions: readonly number[];
  readonly displayState:       DisplayState;
  readonly waitingOnTicketIds: readonly string[];
}

/** A row of `progress.tasks`, as far as a card's tokens, stamp and note read it. */
export interface KanbanTaskDocument {
  readonly tokens?:      number | null;
  readonly start:        string | null;
  readonly end:          string | null;
  readonly reviewed?:    string;
  readonly reviewRound?: number;
  readonly history?:     readonly TaskPhase[];
}

/** One per row of `progress.tasks`, at the same index. */
export interface KanbanRowFacts {
  readonly deliveredRowCountsAsReviewed: boolean;
}

export interface KanbanEpicDocument {
  readonly key:   string;
  readonly title: string;
  readonly slot:  number;
}

export interface KanbanReadyTicket {
  readonly id:    string;
  readonly held?: true;
}

/** A filing cabinet's draft, which is no ticket yet. */
export interface KanbanFilingDraft {
  readonly id:                string;
  readonly title:             string;
  readonly state:             DraftState;
  readonly openQuestionCount: number;
}

/** An open decision, as far as a card's asks pill reads it. */
export interface KanbanDecisionDocument {
  readonly id:        string;
  readonly kind:      string;
  readonly ticketIds: readonly string[];
}

export interface KanbanBoardState {
  readonly decisions: readonly KanbanDecisionDocument[];
  readonly page: {
    readonly tickets: readonly KanbanTicketDocument[];
    readonly payload: {
      readonly concurrency: { readonly limit: number };
      readonly limits:      TimestampSlices & DurationUnits;
      readonly progress:    { readonly tasks: readonly KanbanTaskDocument[] };
      readonly boardFacts: {
        readonly rows:         readonly KanbanRowFacts[];
        readonly tickets:      readonly KanbanTicketFacts[];
        readonly epics:        readonly KanbanEpicDocument[];
        readonly readyTickets: readonly KanbanReadyTicket[];
        readonly drafts?:      readonly KanbanFilingDraft[];
      };
    };
  };
  readonly mergeQueue: {
    readonly queuedTicketIds: readonly string[];
    /** Read only for the tickets waiting for User's merge accept, which lead the Merge queue lane; missing on an older board. */
    readonly targets?:        readonly { readonly waitingForMerge?: readonly { readonly ticketId: string }[] }[];
  };
}
