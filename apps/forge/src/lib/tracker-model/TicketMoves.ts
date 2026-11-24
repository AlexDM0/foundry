/**
 * A ticket's lifecycle on the Board: its filing, its moves between statuses with the row following along, a further review pass, and
 * its release, each stamping the ticket and logging the move.
 */
import type {
  DraftsSubmitted,
  TicketChanged,
  TicketMoved,
  TicketMoveRequest,
  TicketRelease,
  TicketsReadied,
  TicketsReleased
}                                         from './@types/BoardChanges.ts';
import type { Job }       from './@types/Job.ts';
import type { LogRecord } from './@types/LogRecord.ts';
import type {
  ReadinessGap,
  RowedTicketStatus,
  Ticket,
  TicketFrontmatter,
  TicketStatus
} from './@types/Ticket.ts';
import type { BoardRecords }                 from './BoardRecords.ts';
import { BoardRefusal }                      from './BoardRefusal.ts';
import type { GroupReleases }                from './GroupReleases.ts';
import type { ReviewBars, ReviewBarsClosed } from './ReviewBars.ts';
import type { TicketDependencies }           from './TicketDependencies.ts';
import { FIRST_REPEAT_REVIEW_ROUND }         from './constants/ReviewRounds.ts';
import { TICKET_STATUSES_USER_READIES }      from './constants/Statuses.ts';
import { EntityOwnershipUtil }               from './utils/EntityOwnershipUtil.ts';
import { TicketBodyHashUtil }                from './utils/TicketBodyHashUtil.ts';
import { TicketDocumentReadinessUtil }       from './utils/TicketDocumentReadinessUtil.ts';
import { TicketDocumentReadingUtil }         from './utils/TicketDocumentReadingUtil.ts';
import { TicketMoveUtil }                    from './utils/TicketMoveUtil.ts';

type TicketMoveFields = Pick<TicketMoveRequest, 'branch' | 'commit' | 'reason' | 'byHand'>;

/** The files a body's Brief says the work belongs in, as repository paths; the caller reads the body, since the model holds no markdown reader. */
export type WorkFilesOf = (body: string) => readonly string[];

export class TicketMoves {
  constructor(
    private readonly records: BoardRecords,
    private readonly reviewBars: ReviewBars,
    private readonly dependencies: TicketDependencies,
    private readonly groupReleases: GroupReleases,
  ) {}

  /** Judged against the tickets already on the board, before the new one joins, so a ticket naming its own id names no ticket. */
  fileTicket(ticket: Ticket, at: string): TicketChanged {
    const { frontmatter } = ticket;
    if (this.records.ticketRecordById(frontmatter.id) !== undefined) throw new BoardRefusal({ reason: 'ticket-id-already-filed', ticketId: frontmatter.id });
    this.dependencies.refuseAnUnworkableDependencyList(frontmatter.id, frontmatter.dependsOn ?? []);
    this.records.ticketRecords.push(ticket);
    this.records.ensureTaskForTicketOnTheChart(ticket, at);
    this.records.markChanged(ticket);
    const jobFiling = frontmatter.filedByJob === undefined ? {} : {
      status:     frontmatter.status,
      priority:   frontmatter.priority ?? '',
      filedByJob: frontmatter.filedByJob,
    };
    return { logged: [this.records.logger.log({ kind: 'ticket-filed', ticketId: frontmatter.id, fields: { title: frontmatter.title, ...jobFiling } }, at)], ticket };
  }

  /**
   * `checksLegality` false is the deliberate override of the legality table. The tokens are judged after the move, which files a
   * low ticket's row when it starts; a refused invocation writes nothing, so the move before the refusal is never seen.
   */
  moveTicket(ticketId: string, requestedStatus: TicketStatus, request: TicketMoveRequest, at: string): TicketMoved {
    const ticket     = this.records.requireTicket(ticketId);
    const { status } = ticket.frontmatter;
    const move       = TicketMoveUtil.moveVerdictOf(ticketId, status, requestedStatus, request.checksLegality);
    if (move.verdict === 'refused') throw new BoardRefusal(move.refusal);
    const { targetStatus } = move;
    if (targetStatus === 'abandoned' && (request.reason === undefined || request.reason.trim() === '')) {
      throw new BoardRefusal({ reason: 'abandon-without-reason', ticketId });
    }
    // A Board invariant rather than a move's legality, so `ticket status` is held to it too.
    this.groupReleases.refuseReopeningBesideAnOpenReleaseTicket(ticket, targetStatus);

    const moveRecord = this.applyTicketMove(ticket, targetStatus, request, at);
    if (request.tokens !== undefined) {
      if (ticket.frontmatter.task === null) throw new BoardRefusal({ reason: 'tokens-without-a-row', ticketId });
      const row = this.records.taskRecordById(ticket.frontmatter.task);
      if (row !== undefined) row.tokens = request.tokens;
    }
    // A reviewer is at work only while the ticket is in review, so every move out of it ends the bar, as a release does.
    const closed: ReviewBarsClosed = targetStatus === 'in-review' ? { bars: [], logged: [] } : this.reviewBars.closeInProgressReviewBars([ticketId], at);
    return { logged: [moveRecord, ...closed.logged], ticket, closedReviewBars: closed.bars };
  }

  /** The one move that leaves a ticket in its status: a further review pass is still review, so only `updated` moves and the row counts the round. */
  rereviewTicket(ticketId: string, at: string): TicketChanged {
    const ticket          = this.records.requireTicket(ticketId);
    const { frontmatter } = ticket;
    if (frontmatter.status !== 'in-review') throw new BoardRefusal({ reason: 'rereview-outside-review', ticketId, status: frontmatter.status });

    frontmatter.updated = at;
    const task          = this.records.ensureTaskForTicket(ticket, at);
    this.records.transitionTaskInPlace(task, 're-review', at);
    this.records.markChanged(ticket);
    const round         = task.reviewRound ?? FIRST_REPEAT_REVIEW_ROUND;
    return { logged: [this.records.logger.log({ kind: 'ticket-rereviewed', ticketId, fields: { round } }, at)], ticket };
  }

  /**
   * A committed ticket no agent has picked up goes back into `draft`, where its content is edited, and is committed again by the way any
   * draft is. A draft has no row and no kept content, so both go; its priority, entity, group, epics, dependencies and hold stay.
   */
  unreadyTicket(ticketId: string, unsettledJobs: readonly Readonly<Job>[], at: string): TicketChanged {
    const ticket          = this.records.requireTicket(ticketId);
    const { frontmatter } = ticket;
    if (frontmatter.status !== 'committed') throw new BoardRefusal({ reason: 'unready-of-a-ticket-not-committed', ticketId, status: frontmatter.status });
    const jobOfTheTicket = unsettledJobs.find((job) => job.ticketIds.includes(ticketId));
    if (jobOfTheTicket !== undefined) throw new BoardRefusal({ reason: 'unready-of-a-ticket-with-a-job', ticketId, jobId: jobOfTheTicket.id });

    frontmatter.status  = 'draft';
    frontmatter.updated = at;
    delete frontmatter.contentHash;
    const row = frontmatter.task === null ? undefined : this.records.taskRecordById(frontmatter.task);
    if (row !== undefined) this.records.removeTaskRecord(row);
    frontmatter.task = null;
    this.records.markChanged(ticket);
    return { logged: [this.records.logger.log({ kind: 'ticket-unreadied', ticketId, fields: {} }, at)], ticket };
  }

  /**
   * Every named draft moves to `committed` with a row at any priority, or none does: a ticket not in `draft` is refused first, then, in a
   * forge with entities, every ticket without one, then every ticket the reading finds gaps in, all named at once. Every way to `committed`
   * passes here, so a ticket is never built without its entity. Only User's own `ticket ready` passes `ready-for-review` as readiable. A
   * filer's move passes `workFilesOf`, so a ticket whose Brief names work outside its entity is refused (E85); a need's ticket, filed by
   * Hephaestus for the entity the need names, passes none.
   */
  readyDraftTickets(
    ticketIds: readonly string[],
    readinessGapsOf: (body: string) => readonly ReadinessGap[],
    at: string,
    readiableStatuses: readonly TicketStatus[] = ['draft'],
    workFilesOf?: WorkFilesOf,
  ): TicketsReadied {
    const readiedTickets = [...new Set(ticketIds)].map((ticketId) => this.records.requireTicket(ticketId));
    const notADraft      = readiedTickets.find((ticket) => !readiableStatuses.includes(ticket.frontmatter.status));
    if (notADraft !== undefined) {
      throw new BoardRefusal({ reason: 'ready-of-a-ticket-not-in-draft', ticketId: notADraft.frontmatter.id, status: notADraft.frontmatter.status });
    }
    this.refuseTicketsWithoutAnEntity(readiedTickets);
    this.refuseWorkOutsideTheEntity(readiedTickets, workFilesOf);
    const incompleteTickets = readiedTickets.flatMap((ticket) => {
      const gaps = this.readinessGapsOfTicket(ticket, readinessGapsOf);
      return gaps.length === 0 ? [] : [{ ticketId: ticket.frontmatter.id, gaps }];
    });
    if (incompleteTickets.length > 0) throw new BoardRefusal({ reason: 'incomplete-tickets', incompleteTickets });

    const logged = readiedTickets.map((ticket) => {
      const { frontmatter } = ticket;
      frontmatter.status      = 'committed';
      frontmatter.updated     = at;
      frontmatter.contentHash = TicketBodyHashUtil.contentHashOf(frontmatter.title, ticket.body);
      this.records.ensureTaskForTicket(ticket, at);
      this.records.markChanged(ticket);
      return this.records.logger.log({ kind: 'ticket-committed', ticketId: frontmatter.id, fields: {} }, at);
    });
    return { logged, tickets: readiedTickets };
  }

  /**
   * The filer's close of its drafts: a complete draft moves to `committed` with its row when ticket review is off, or to `ready-for-review`
   * with no row when it is on. An incomplete draft stays a draft and is returned with its gaps. A ticket not in `draft` is refused.
   */
  submitDraftTickets(
    ticketIds: readonly string[],
    ticketReviewIsOn: boolean,
    readinessGapsOf: (body: string) => readonly ReadinessGap[],
    at: string,
    workFilesOf?: WorkFilesOf,
  ): DraftsSubmitted {
    const namedTickets = [...new Set(ticketIds)].map((ticketId) => this.records.requireTicket(ticketId));
    const notADraft    = namedTickets.find((ticket) => ticket.frontmatter.status !== 'draft');
    if (notADraft !== undefined) {
      throw new BoardRefusal({ reason: 'ready-of-a-ticket-not-in-draft', ticketId: notADraft.frontmatter.id, status: notADraft.frontmatter.status });
    }
    const incompleteTickets = namedTickets.flatMap((ticket) => {
      const gaps = this.readinessGapsOfTicket(ticket, readinessGapsOf);
      return gaps.length === 0 ? [] : [{ ticketId: ticket.frontmatter.id, gaps }];
    });
    const completeTickets = namedTickets.filter((ticket) => !incompleteTickets.some((incomplete) => incomplete.ticketId === ticket.frontmatter.id));
    if (!ticketReviewIsOn) {
      const completeIds = completeTickets.map((ticket) => ticket.frontmatter.id);
      const readied     = completeIds.length === 0 ? { logged: [], tickets: [] } : this.readyDraftTickets(completeIds, readinessGapsOf, at, undefined, workFilesOf);
      return { ...readied, incompleteTickets };
    }
    this.refuseWorkOutsideTheEntity(completeTickets, workFilesOf);
    const logged = completeTickets.map((ticket) => this.putBeforeReview(ticket, at));
    return { logged, tickets: completeTickets, incompleteTickets };
  }

  /**
   * The E85 judgement of a submit, run before anything it would undo moves: the complete tickets, which a submit moves, refused when a
   * Brief names work outside its entity. A ticket not yet filed may be judged too.
   */
  refuseWorkOutsideTheEntityOfCompleteTickets(
    tickets: readonly Readonly<Ticket>[],
    readinessGapsOf: (body: string) => readonly ReadinessGap[],
    workFilesOf: WorkFilesOf,
  ): void {
    this.refuseWorkOutsideTheEntity(tickets.filter((ticket) => this.readinessGapsOfTicket(ticket, readinessGapsOf).length === 0), workFilesOf);
  }

  /**
   * The `ticket-without-entity` judgement of a submit with ticket review off, run before anything it would undo moves: a complete ticket
   * without an entity, which that submit would make `committed`. A ticket not yet filed may be judged too.
   */
  refuseASubmitWithoutAnEntity(
    tickets: readonly Readonly<Ticket>[],
    ticketReviewIsOn: boolean,
    readinessGapsOf: (body: string) => readonly ReadinessGap[],
  ): void {
    if (!ticketReviewIsOn) this.refuseTicketsWithoutAnEntity(tickets.filter((ticket) => this.readinessGapsOfTicket(ticket, readinessGapsOf).length === 0));
  }

  /**
   * Whether User's own `ticket ready` takes the ticket in its state: its status, and on a forge with entities its entity. The body's
   * readiness and the paths its Brief names are judged only when it is readied, since the model reads no markdown.
   */
  userReadyIsOpenTo(ticket: Readonly<Ticket>): boolean {
    return TICKET_STATUSES_USER_READIES.includes(ticket.frontmatter.status) && !this.ticketNeedsAnEntity(ticket);
  }

  /** In a forge with entities, a ticket without one: it cannot reach `committed`, since it would build in no entity's pipeline. */
  private ticketNeedsAnEntity(ticket: Readonly<Ticket>): boolean {
    return this.records.pipeline?.entities !== undefined && ticket.frontmatter.entity === undefined;
  }

  /** In a forge with entities, every ticket without one, all named at once: each ticket builds in the pipeline of its entity. */
  private refuseTicketsWithoutAnEntity(tickets: readonly Readonly<Ticket>[]): void {
    const ticketIdsWithoutAnEntity = tickets.filter((ticket) => this.ticketNeedsAnEntity(ticket)).map((ticket) => ticket.frontmatter.id);
    if (ticketIdsWithoutAnEntity.length > 0) throw new BoardRefusal({ reason: 'ticket-without-entity', ticketIds: ticketIdsWithoutAnEntity });
  }

  /** On a forge with entities, every ticket with an entity whose Brief names work outside it, all named at once (E85). */
  private refuseWorkOutsideTheEntity(tickets: readonly Readonly<Ticket>[], workFilesOf: WorkFilesOf | undefined): void {
    const entities = this.records.pipeline?.entities;
    if (entities === undefined || workFilesOf === undefined) return;
    const ticketsOutside = tickets.flatMap((ticket) => {
      const { frontmatter } = ticket;
      if (frontmatter.entity === undefined) return [];
      const paths = EntityOwnershipUtil.pathsOutsideEntityOf(entities, frontmatter.entity, workFilesOf(this.briefBodyOfTicket(ticket)));
      return paths.length === 0 ? [] : [{ ticketId: frontmatter.id, entity: frontmatter.entity, paths }];
    });
    if (ticketsOutside.length > 0) throw new BoardRefusal({ reason: 'work-outside-entity', ticketsOutside });
  }

  /** A ticket with documents is judged by them, its spec read for the Acceptance; any other by its body. */
  readinessGapsOfTicket(ticket: Readonly<Ticket>, readinessGapsOf: (body: string) => readonly ReadinessGap[]): ReadinessGap[] {
    const ticketId     = ticket.frontmatter.id;
    const loadedRecord = this.records.ticketDocumentsAreUnreadable(ticketId) ? 'unreadable' : this.records.ticketDocumentRecordOf(ticketId);
    return TicketDocumentReadinessUtil.readinessGapsOf(ticket, loadedRecord, readinessGapsOf);
  }

  /** The body whose Brief says where the work belongs: for a ticket with documents, its approved plan read as the Brief. */
  private briefBodyOfTicket(ticket: Readonly<Ticket>): string {
    const loadedRecord = this.records.ticketDocumentRecordOf(ticket.frontmatter.id);
    if (loadedRecord === undefined) return ticket.body;
    return TicketDocumentReadingUtil.bodyWithPlanAsBriefOf(TicketDocumentReadingUtil.briefTextOf(loadedRecord) ?? '');
  }

  /**
   * Moves a ticket not yet started to `ready-for-review`, past the move rules, which keep that status for the filer's close. Its content is
   * editable again there, so a committed ticket drops its content hash.
   */
  putBeforeReview(ticket: Ticket, at: string): LogRecord {
    const { frontmatter } = ticket;
    frontmatter.status    = 'ready-for-review';
    frontmatter.updated   = at;
    delete frontmatter.contentHash;
    this.records.markChanged(ticket);
    return this.records.logger.log({ kind: 'ticket-submitted-for-review', ticketId: frontmatter.id, fields: {} }, at);
  }

  /**
   * Each ticket is reviewed and then delivered, in the order given, and every in-progress review bar of them is closed after the moves.
   * A bundle ticket already reviewed skips the first move, so it is approved once.
   */
  releaseTickets(ticketIds: readonly string[], release: TicketRelease, at: string): TicketsReleased {
    const releasedTicketIds = [...new Set(ticketIds)];
    const releasedTickets   = releasedTicketIds.map((ticketId) => this.records.requireTicket(ticketId));
    const unreleasable      = releasedTickets.find((ticket) => !this.ticketIsReleasable(ticket, releasedTicketIds));
    if (unreleasable !== undefined) {
      throw new Error(`Ticket #${unreleasable.frontmatter.id} is ${unreleasable.frontmatter.status}; a caller refuses such a release before asking for it.`);
    }

    const logged: LogRecord[] = [];
    for (const ticket of releasedTickets) {
      if (ticket.frontmatter.status !== 'reviewed') logged.push(this.applyTicketMove(ticket, 'reviewed', {}, at));
      logged.push(this.applyTicketMove(ticket, 'delivered', release, at));
    }
    // The reviewer releases as the last step of its pass, so its bar is closed here rather than left in progress until the verdict is read.
    const closed = this.reviewBars.closeInProgressReviewBars(releasedTickets.map((ticket) => ticket.frontmatter.id), at);
    return { logged: [...logged, ...closed.logged], tickets: releasedTickets, closedReviewBars: closed.bars };
  }

  /**
   * A release reviews the ticket on its way to delivering it, so it takes the tickets a move to `reviewed` is legal from, and besides
   * them a `reviewed` ticket of a release bundle whose release ticket, itself releasable that way, is released with it.
   */
  ticketIsReleasable(ticket: Readonly<Ticket>, releasedTicketIds: readonly string[]): boolean {
    const { id: ticketId, status, group } = ticket.frontmatter;
    if (TicketMoveUtil.ticketMoveIsLegal(status, 'reviewed')) return true;
    if (status !== 'reviewed' || group === undefined) return false;
    const releaseBundle = this.groupReleases.releaseBundleOf(group);
    return releaseBundle.includes(ticketId) && releasedTicketIds.some((releasedTicketId) => {
      const releasedTicket = this.records.ticketRecordById(releasedTicketId);
      return releasedTicket !== undefined
        && releasedTicket.frontmatter.releasesGroup === true
        && releaseBundle.includes(releasedTicketId)
        && TicketMoveUtil.ticketMoveIsLegal(releasedTicket.frontmatter.status, 'reviewed');
    });
  }

  /** The move itself, unchecked: the status, its stamps and the fields given, and the row taking the same status. A reopen keeps the content then. */
  applyTicketMove(ticket: Ticket, targetStatus: RowedTicketStatus, fields: TicketMoveFields, at: string): LogRecord {
    const { frontmatter } = ticket;
    frontmatter.status      = targetStatus;
    frontmatter.updated     = at;
    const stamps            = TicketMoveUtil.stampsAfterMoveOf(frontmatter, targetStatus, at);
    frontmatter.started     = stamps.started;
    frontmatter.finished    = stamps.finished;
    frontmatter.delivered   = stamps.delivered;
    frontmatter.abandonedAt = stamps.abandonedAt;
    if (stamps.clearsReason) delete frontmatter.reason;
    if (fields.branch !== undefined) frontmatter.branch = fields.branch;
    if (fields.commit !== undefined) frontmatter.commit = fields.commit;
    if (fields.reason !== undefined) frontmatter.reason = fields.reason;
    if (targetStatus === 'committed') frontmatter.contentHash = TicketBodyHashUtil.contentHashOf(frontmatter.title, ticket.body);

    const task = this.records.ensureTaskForTicketOnTheChart(ticket, at);
    if (task !== null) this.records.transitionTaskInPlace(task, targetStatus, at);
    this.records.markChanged(ticket);
    return this.logTicketMove(frontmatter, targetStatus, fields.byHand === true, at);
  }

  /** `committed` is logged as a reopen: a ticket first reaches `committed` by `readyDraftTickets`, which logs `ticket-committed`. */
  private logTicketMove(frontmatter: Readonly<TicketFrontmatter>, targetStatus: RowedTicketStatus, byHand: boolean, at: string): LogRecord {
    const ticketId = frontmatter.id;
    const { logger } = this.records;
    switch (targetStatus) {
      case 'committed':
        return logger.log({ kind: 'ticket-reopened', ticketId, fields: {} }, at);
      case 'in-progress':
        return logger.log({ kind: 'ticket-started', ticketId, fields: {} }, at);
      case 'in-review':
        return logger.log({ kind: 'ticket-finished', ticketId, fields: {} }, at);
      case 'reviewed':
        return logger.log({ kind: 'ticket-approved', ticketId, fields: {} }, at);
      case 'delivered':
        return logger.log({ kind: 'ticket-delivered', ticketId, fields: byHand ? { byHand } : {} }, at);
      case 'abandoned':
        return logger.log({ kind: 'ticket-abandoned', ticketId, fields: { reason: frontmatter.reason ?? '' } }, at);
    }
  }
}
