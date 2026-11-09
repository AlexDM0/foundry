/** The fields of the Overseer's `BoardState` the detail panel reads, exactly those, so the state document satisfies it unchanged. */
import type { DraftSummary }                             from '../../src/lib/tracker-model/@types/Draft.ts';
import type { DisplayState, TaskPhase, TaskStatus }      from '../../src/lib/tracker-model/@types/Task.ts';
import type { TicketPriority, TicketStatus, TicketType } from '../../src/lib/tracker-model/@types/Ticket.ts';
import type { DurationUnits, TimestampSlices }           from '../utils/TimeUtil.ts';
import type { WaitingForMergeEntryDocument }             from './BoardStateDocument.ts';
import type { TimelineLimits }                           from './Timeline.ts';

export interface DetailTicketDocument {
  readonly id:             string;
  readonly title:          string;
  readonly type:           TicketType;
  readonly status:         TicketStatus;
  readonly priority?:      TicketPriority;
  readonly hold?:          string;
  readonly epics?:         readonly string[];
  readonly group?:         string;
  readonly releasesGroup?: true;
  readonly dependsOn?:     readonly string[];
  readonly branch?:        string;
  readonly commit?:        string;
  readonly reason?:        string;
  readonly network?:       readonly string[];
  readonly task:           number | null;
  readonly filed:          string;
  readonly updated:        string;
  readonly started:        string | null;
  readonly finished:       string | null;
  readonly delivered:      string | null;
  readonly abandonedAt:    string | null;
  /** Marked output of the ticket's body: agent-written, so it reaches the DOM only inside a sandboxed frame. */
  readonly bodyHtml:       string;
}

export interface DetailTaskDocument {
  readonly id:           number;
  readonly name:         string;
  readonly status:       TaskStatus;
  readonly start:        string | null;
  readonly end:          string | null;
  readonly owner:        string;
  readonly note:         string;
  readonly ticket:       string | null;
  readonly tokens:       number | null;
  readonly reviewOf?:    string;
  readonly reviewed?:    string;
  readonly reviewRound?: number;
  readonly history?:     readonly TaskPhase[];
}

/** One per row of `progress.tasks`, at the same index. */
export interface DetailRowFacts {
  readonly displayState:                 DisplayState;
  readonly deliveredRowCountsAsReviewed: boolean;
}

export interface DetailTicketFacts {
  readonly ticketId:           string;
  readonly ownRowPosition:     number | null;
  /** Oldest filed first. */
  readonly reviewBarPositions: readonly number[];
  readonly displayState:       DisplayState;
  readonly waitingOnTicketIds: readonly string[];
}

export interface DetailEpicDocument {
  readonly key:   string;
  readonly title: string;
  readonly slot:  number;
}

/** A worded log line: one worded from a record carries both id lists, a note carries neither. */
export interface DetailLogEntry {
  readonly at:         string;
  readonly text:       string;
  readonly taskIds?:   readonly number[];
  readonly ticketIds?: readonly string[];
}

export interface DetailMergeTargetDocument {
  readonly target:           string;
  readonly waitingForMerge?: readonly WaitingForMergeEntryDocument[];
}

export type DetailLimits = TimelineLimits & TimestampSlices & DurationUnits;

export interface DetailBoardState {
  /** Read only for the tickets waiting for merge, which the panel offers Accept and Update branch. */
  readonly mergeQueue?: { readonly targets: readonly DetailMergeTargetDocument[] };
  readonly page: {
    readonly tickets: readonly DetailTicketDocument[];
    readonly payload: {
      readonly progress:       { readonly tasks: readonly DetailTaskDocument[]; readonly log: readonly DetailLogEntry[] };
      readonly limits:         DetailLimits;
      readonly draftRequests?: readonly { readonly id: string; readonly request: string }[];
      readonly boardFacts: {
        readonly rows:    readonly DetailRowFacts[];
        readonly tickets: readonly DetailTicketFacts[];
        readonly epics:   readonly DetailEpicDocument[];
        readonly drafts?: readonly Readonly<DraftSummary>[];
      };
    };
  };
}
