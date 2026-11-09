/** The fields of the Overseer's `BoardState` the Epics view reads, exactly those, so the state document satisfies it unchanged. */
import type { DisplayState }                   from '../../src/lib/tracker-model/@types/Task.ts';
import type { TicketPriority, TicketStatus }   from '../../src/lib/tracker-model/@types/Ticket.ts';
import type { DurationUnits, TimestampSlices } from '../utils/TimeUtil.ts';
import type { EpicRollupDocument }             from './BoardStateDocument.ts';

export interface EpicsTicketDocument {
  readonly id:          string;
  readonly title:       string;
  readonly status:      TicketStatus;
  readonly updated:     string;
  readonly delivered:   string | null;
  readonly abandonedAt: string | null;
  readonly priority?:   TicketPriority;
  readonly dependsOn?:  readonly string[];
  readonly epics?:      readonly string[];
}

export interface EpicsTicketFacts {
  readonly ticketId:       string;
  readonly ownRowPosition: number | null;
  readonly displayState:   DisplayState;
}

export interface EpicsBoardState {
  readonly page: {
    readonly tickets: readonly EpicsTicketDocument[];
    readonly payload: {
      readonly progress:         { readonly tasks: readonly { readonly reviewRound?: number }[] };
      readonly limits:           TimestampSlices & DurationUnits;
      readonly concurrency:      { readonly limit: number };
      readonly epicDescriptions: readonly { readonly key: string; readonly descriptionHtml: string }[];
      readonly boardFacts:       {
        readonly epics:   readonly EpicRollupDocument[];
        readonly tickets: readonly EpicsTicketFacts[];
      };
    };
  };
}
