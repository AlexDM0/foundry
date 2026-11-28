import type { DispatchCapacity }          from '../../domain/tracker-model/@types/Concurrency.ts';
import type { DraftSummary }              from '../../domain/tracker-model/@types/Draft.ts';
import type { EpicRollup }                from '../../domain/tracker-model/@types/Epic.ts';
import type { Task }                      from '../../domain/tracker-model/@types/Task.ts';
import type { ReadyTicket, TicketStatus } from '../../domain/tracker-model/@types/Ticket.ts';
import type { ConfinementVerdict }        from '../../lib/gate-confinement/GateConfinement.ts';
import type { WordedProgressDocument }    from '../../shared/@types/WordedProgressDocument.ts';
import type { TicketJsonUtil }            from '../utils/TicketJsonUtil.ts';
import type {
  InProgressIds,
  StatusBoardWork,
  StatusDecisionsAndIncidents,
  StatusJobs
}                                         from './StatusDocumentFields.ts';

export interface OwnerTokenTotal {
  owner:  string;
  tokens: number;
  rows:   number;
}

export interface OwnerTokenTotals {
  owners:        OwnerTokenTotal[];
  withoutOwner:  { tokens: number; rows: number };
  withoutTokens: { rows: number };
}

/** Whose probe gave the confinement word: the live Hephaestus's, or this process's own when none answers. */
export type ConfinementSource = 'hephaestus' | 'this-process';

/** The dispatch capacity with the ids in flight ending the block. */
export type StatusConcurrency = DispatchCapacity & InProgressIds;

/**
 * The `status --json --full` document: the worded progress file, whose `jobs`, `decisions` and `incidents` the board's own lists replace and
 * whose `tasks` `--tickets-only` narrows, with every ticket and the derived and dispatch fields beside it.
 */
export interface FullStatusDocument
  extends Omit<WordedProgressDocument, 'tasks' | 'jobs' | 'decisions' | 'incidents'>, StatusBoardWork, StatusJobs, StatusDecisionsAndIncidents {
  tasks:               readonly Readonly<Task>[];
  tickets:             ReturnType<typeof TicketJsonUtil.ticketDocumentOf>[];
  epics:               EpicRollup[];
  drafts:              DraftSummary[];
  concurrency:         StatusConcurrency;
  readyTickets:        ReadyTicket[];
  tokensByOwner:       OwnerTokenTotals;
  ticketCountByStatus: Record<TicketStatus, number>;
  confinement:         ConfinementVerdict;
  confinementSource:   ConfinementSource;
  pipelineIsSet:       boolean;
}
