/** The fields of the Overseer's `BoardState` the detail panel reads, exactly those, so the state document satisfies it unchanged. */
import type { DraftSummary }                             from '../../src/lib/tracker-model/@types/Draft.ts';
import type { DisplayState, TaskPhase, TaskStatus }      from '../../src/lib/tracker-model/@types/Task.ts';
import type { TicketPriority, TicketStatus, TicketType } from '../../src/lib/tracker-model/@types/Ticket.ts';
import type { TicketForecastStep }                       from '../../src/lib/tracker-model/@types/TicketForecast.ts';
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

/** A job on the board as the ticket form reads it: the build, review or merge-agent job working on the ticket, joined by its `ticketIds`. */
export interface DetailJobDocument {
  readonly id:           string;
  readonly kind:         string;
  readonly role:         string | null;
  readonly ticketIds:    readonly string[];
  readonly state:        string;
  readonly attempt:      number;
  /** Set once User asked the job to stop, wind down or make way for a fresh agent: the job is stopping. */
  readonly stopRequest?: string;
  readonly live: {
    readonly calls:        number;
    readonly callBudget:   number | null;
    readonly lastToolCall: { readonly toolName: string; readonly running: boolean } | null;
    /** A Watcher of an older protocol, which the Overseer only watches: the job takes nothing but Stop. */
    readonly watchOnly?:   boolean;
  };
}

/** An open incident as the ticket form names it: the newest one listing the ticket heads its Overview. */
export interface DetailIncidentDocument {
  readonly id:          string;
  readonly kind:        string;
  readonly ticketIds:   readonly string[];
  readonly defaultMove: string;
}

/** An open ticket's steps to its landing and the tickets waiting on it, as `BoardState.ticketForecasts` serves them. */
export interface DetailTicketForecastDocument {
  readonly ticketId:         string;
  readonly steps:            readonly Readonly<TicketForecastStep>[];
  /** The step under way; `null` while nothing runs on the ticket. */
  readonly currentStepIndex: number | null;
  readonly dependents:       readonly { readonly ticketId: string; readonly stillWaitingOnTicketIds: readonly string[] }[];
}

export interface DetailBoardState {
  /** Read only for the tickets waiting for merge, which the panel offers Accept and Update branch. */
  readonly mergeQueue?:      { readonly targets: readonly DetailMergeTargetDocument[] };
  /** The board's jobs, each read only through the ticket form's guard, so a partial record is passed over. */
  readonly jobs?:            readonly unknown[];
  /** Missing from an older Overseer: the ticket form then shows no Next. */
  readonly ticketForecasts?: readonly DetailTicketForecastDocument[];
  readonly incidents?:       readonly DetailIncidentDocument[];
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
