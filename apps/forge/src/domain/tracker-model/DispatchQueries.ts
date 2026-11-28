/**
 * What Hephaestus reads off the Board to start its next job: the concurrency and the jobs holding its slots, the ready and held tickets,
 * what a ticket still waits on, which tickets have a builder or a reviewer at work, and the check command a release runs.
 */
import type { Concurrency, DispatchCapacity } from './@types/Concurrency.ts';
import type { LaunchSlots }                   from './@types/LaunchSlots.ts';
import type { Task }                          from './@types/Task.ts';
import type { ReadyTicket, Ticket }           from './@types/Ticket.ts';
import type { HephaestusState }               from './@types/TrackerProgress.ts';
import type { BoardRecords }                  from './BoardRecords.ts';
import type { GroupReleases }                 from './GroupReleases.ts';
import { DEFAULT_HEPHAESTUS_STATE }           from './constants/HephaestusStates.ts';
import { SETTLED_TICKET_STATUSES }            from './constants/Statuses.ts';
import { ConcurrencyUtil }                    from './utils/ConcurrencyUtil.ts';
import { LaunchSlotUtil }                     from './utils/LaunchSlotUtil.ts';
import { TicketDefaultsUtil }                 from './utils/TicketDefaultsUtil.ts';
import { TicketDependencyUtil }               from './utils/TicketDependencyUtil.ts';
import { TicketDocumentReadinessUtil }        from './utils/TicketDocumentReadinessUtil.ts';
import { TicketWritingUtil }                  from './utils/TicketWritingUtil.ts';

/** The hold a committed ticket's documents put on it while they are not in order; derived, never written to the ticket's `hold`. */
export const DOCUMENTS_HOLD_REASON = 'documents-not-in-order';

export class DispatchQueries {
  constructor(
    private readonly records: BoardRecords,
    private readonly groupReleases: GroupReleases,
  ) {}

  concurrency(): Concurrency {
    return ConcurrencyUtil.concurrencyOf(this.records.progress.jobs ?? [], this.records.progress.concurrencyLimit);
  }

  /** Counted through `LaunchSlotUtil`, as `concurrency()` is, so `slotJobIds` is always as long as `agentsInFlight`. */
  launchSlots(): LaunchSlots {
    const jobs = this.records.progress.jobs ?? [];
    const ticketIdsWithJob = new Set(jobs.flatMap((job) => job.ticketIds));
    return {
      limit:                         this.concurrency().limit,
      slotJobIds:                    LaunchSlotUtil.slotJobIdsOf(jobs),
      inProgressTicketIdsWithoutJob: this.records.ticketRecords
        .filter(({ frontmatter }) => frontmatter.status === 'in-progress' && !ticketIdsWithJob.has(frontmatter.id))
        .map(({ frontmatter }) => frontmatter.id),
    };
  }

  hephaestusState(): HephaestusState {
    return this.records.progress.hephaestusState ?? DEFAULT_HEPHAESTUS_STATE;
  }

  /** In the order to take them: by priority, then by readiness, then by id. */
  readyTickets(): readonly Readonly<Ticket>[] {
    const readyTicketIds = TicketDependencyUtil.readyTicketIdsOf(this.records.ticketRecords.map((ticket) => ticket.frontmatter), this.readinessPositionByTicketId());
    const readyTickets   = readyTicketIds.flatMap((ticketId) => this.records.ticketRecordById(ticketId) ?? []);
    return this.withoutGroupRunTickets(readyTickets.filter((ticket) => !this.ticketIsHeldByItsDocuments(ticket)));
  }

  /**
   * A committed ticket with documents is held while its spec, or a document its builder reads, is not approved at its head, or its plan
   * was approved on an older spec. A builder whose rule never reads the plan is held by the spec alone. One whose documents record cannot
   * be read is held too, since nothing says its documents are in order.
   */
  ticketIsHeldByItsDocuments(ticket: Readonly<Ticket>): boolean {
    if (ticket.frontmatter.status !== 'committed') return false;
    if (this.records.ticketDocumentsAreUnreadable(ticket.frontmatter.id)) return true;
    const loadedRecord = this.records.ticketDocumentRecordOf(ticket.frontmatter.id);
    if (loadedRecord === undefined) return false;
    const builderReadsPlan = TicketWritingUtil.documentReadingRuleOf(this.records.pipeline, 'builder', 'plan', ticket.frontmatter.entity) !== 'never';
    return TicketDocumentReadinessUtil.documentGapsOf(loadedRecord, builderReadsPlan).length > 0;
  }

  /** The log position of each ticket's latest `ticket-committed` or `ticket-reopened` record; a clearing forgets every earlier one. */
  readinessPositionByTicketId(): Map<string, number> {
    const positionByTicketId = new Map<string, number>();
    [...this.records.storedLogRecords, ...this.records.loggedRecords].forEach((record, position) => {
      if (record.kind === 'tracker-cleared') positionByTicketId.clear();
      if (record.kind === 'ticket-committed' || record.kind === 'ticket-reopened') positionByTicketId.set(record.ticketId, position);
    });
    return positionByTicketId;
  }

  /** Read from the ready tickets, as `readyTicketIds` is, so the two lists cannot disagree on a member or the order; defaults resolved here. */
  readyTicketEntries(): ReadyTicket[] {
    return this.readyTickets().map(({ frontmatter }) => ({
      id:       frontmatter.id,
      priority: TicketDefaultsUtil.ticketPriorityOf(frontmatter),
      model:    TicketDefaultsUtil.agentModelOf(frontmatter),
      effort:   TicketDefaultsUtil.agentEffortOf(frontmatter),
      ...(frontmatter.group === undefined ? {} : { group: frontmatter.group }),
      ...(frontmatter.hold === undefined ? {} : { held: true as const }),
    }));
  }

  /** Every held ticket Hephaestus could still start a step of, in progress or in review as much as ready, its documents' hold included. */
  heldTicketIds(): string[] {
    return this.records.ticketRecords
      .filter((ticket) => (ticket.frontmatter.hold !== undefined && !SETTLED_TICKET_STATUSES.includes(ticket.frontmatter.status)) || this.ticketIsHeldByItsDocuments(ticket))
      .map((ticket) => ticket.frontmatter.id);
  }

  /**
   * What Hephaestus needs to start the next job: the limit, the agents in flight against it, what is left, and the tickets that could take it —
   * in the order to take them — and where the user left Hephaestus.
   */
  dispatchCapacity(): DispatchCapacity {
    return {
      ...this.concurrency(),
      readyTicketIds:  this.readyTickets().map((ticket) => ticket.frontmatter.id),
      hephaestusState: this.hephaestusState(),
      heldTicketIds:   this.heldTicketIds(),
    };
  }

  /** A dependency missing from the board counts as unsettled: a ticket nobody can see is not finished work. */
  unsettledDependenciesOf(ticketId: string): string[] {
    const ticket = this.records.requireTicket(ticketId);
    return TicketDependencyUtil.unsettledDependenciesOf(ticket.frontmatter.dependsOn ?? [], this.records.ticketStatusById());
  }

  /** Judges the record handed in, so a ticket file a hand edit gave another's id answers for itself. */
  waitingOnOf(ticket: Readonly<Ticket>): string[] {
    return TicketDependencyUtil.waitingOnOf(ticket.frontmatter, this.records.ticketStatusById());
  }

  /** Only an in-progress ticket has a build to resume; a ticket that moved on took its row along. */
  pausedBuildRowOf(ticketId: string): Readonly<Task> | null {
    const ticket = this.records.requireTicket(ticketId);
    if (ticket.frontmatter.status !== 'in-progress') return null;
    const row = this.records.linkedTaskRecordOf(ticket);
    return row?.status === 'paused' ? row : null;
  }

  /** In row order, once each. */
  inProgressTicketIds(): string[] {
    return [...new Set(this.records.progress.tasks.flatMap((task) => (task.status === 'in-progress' && task.ticket !== null ? [task.ticket] : [])))];
  }

  /** Matches `reviewOf` on any row, as a claim and the moves out of review do, so a ticket-owned row storing it counts; in row order, once each. */
  inProgressReviewOfIds(): string[] {
    return [...new Set(this.records.progress.tasks.flatMap((task) => (task.status === 'in-progress' && task.reviewOf !== undefined ? [task.reviewOf] : [])))];
  }

  /** The in-review tickets no reviewer is at work on, held ones included: a caller reads the holds from `heldTicketIds`. */
  reviewWaitingTickets(): readonly Readonly<Ticket>[] {
    const ticketIdsUnderReview = this.inProgressReviewOfIds();
    return this.withoutGroupRunTickets(this.records.ticketRecords.filter((ticket) => (
      ticket.frontmatter.status === 'in-review' && !ticketIdsUnderReview.includes(ticket.frontmatter.id)
    )));
  }

  /** The tickets with a build to resume, in file order. */
  pausedBuildTickets(): readonly Readonly<Ticket>[] {
    return this.withoutGroupRunTickets(this.records.ticketRecords.filter((ticket) => this.pausedBuildRowOf(ticket.frontmatter.id) !== null));
  }

  /** While a group awaits its release, its tickets are the group run's: a whole-board run must not build, review or resume one off the main line. */
  private withoutGroupRunTickets(tickets: readonly Readonly<Ticket>[]): readonly Readonly<Ticket>[] {
    const groupsAwaitingTheirRelease = this.groupReleases.groupsAwaitingTheirRelease();
    return tickets.filter(({ frontmatter }) => frontmatter.group === undefined || !groupsAwaitingTheirRelease.has(frontmatter.group));
  }
}
