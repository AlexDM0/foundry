/**
 * What a ticket and a job accept now, built from the predicates their moves check, so an offered move is one the Board accepts in the
 * ticket's or job's state and one not offered is one it refuses. A command's content (a body's readiness, a domain list, a reason) is judged
 * only when the command comes.
 */
import type { Job }                    from './@types/Job.ts';
import type { Ticket, TicketPriority } from './@types/Ticket.ts';
import type { BoardRecords }           from './BoardRecords.ts';
import type { Jobs }                   from './Jobs.ts';
import type { MergeQueueMarks }        from './MergeQueueMarks.ts';
import type { TicketMoves }            from './TicketMoves.ts';
import type { JobStopHoldMode }        from './constants/JobStopHolds.ts';
import { DocumentAgentJobUtil }        from './utils/DocumentAgentJobUtil.ts';
import { JobControlRuleUtil }          from './utils/JobControlRuleUtil.ts';
import type { MergeForecast }          from './utils/MergeQueueUtil.ts';
import { TicketMoveUtil }              from './utils/TicketMoveUtil.ts';
import { TicketSettingRuleUtil }       from './utils/TicketSettingRuleUtil.ts';

/** User's moves of one ticket, in the order a view lists them. */
export const TICKET_OFFER_KINDS = [
  'ticket-ready',
  'ticket-hold',
  'ticket-unhold',
  'ticket-park',
  'ticket-network',
  'ticket-priority',
  'ticket-deliver-by-hand',
  'merge-accept',
  'merge-update',
] as const;

export type TicketOfferKind = (typeof TICKET_OFFER_KINDS)[number];

export interface TicketOffers {
  kinds:           TicketOfferKind[];
  /** The highest first; empty when `ticket-priority` is not offered. */
  priorityChoices: TicketPriority[];
}

export interface JobOffers {
  stopModes:    JobStopHoldMode[];
  takesFresh:   boolean;
  takesMessage: boolean;
}

/** Every live job takes both: a stop holds its tickets, and a job already stopping only keeps its request. */
const STOP_MODES_OF_A_LIVE_JOB: readonly JobStopHoldMode[] = ['stop', 'wind-down'];

export class MoveOffers {
  constructor(
    private readonly records: BoardRecords,
    private readonly ticketMoves: TicketMoves,
    private readonly jobRules: Jobs,
    private readonly mergeQueueMarks: MergeQueueMarks,
  ) {}

  /** The live job working on the ticket; delivering it by hand is refused while one is. */
  liveJobOfTicket(ticketId: string): Readonly<Job> | undefined {
    return this.jobRules.jobs().find((job) => job.ticketIds.includes(ticketId));
  }

  /** `merge update` takes a ticket waiting for merge, merge approval on, while no job works on it. */
  mergeUpdateIsOpenTo(ticketId: string): boolean {
    return this.records.mergeApprovalIsOn() && this.mergeQueueMarks.ticketIsMergeQueued(ticketId) && this.liveJobOfTicket(ticketId) === undefined;
  }

  /**
   * `mergeWait` is git's prediction for the ticket while it waits for merge, as the merge queue read it, `null` while it does not wait: the
   * accept takes only a clean one.
   */
  ticketOffersOf(ticketId: string, mergeWait: MergeForecast | null): TicketOffers {
    const ticket          = this.records.requireTicket(ticketId);
    const priorityChoices = TicketSettingRuleUtil.priorityChoicesOf(ticket.frontmatter);
    const openKinds       = this.openTicketKindsOf(ticket, priorityChoices, mergeWait);
    return { kinds: TICKET_OFFER_KINDS.filter((kind) => openKinds[kind]), priorityChoices };
  }

  /** A document agent is offered none: it takes its messages and its stop through its document. */
  jobOffersOf(jobId: string): JobOffers {
    const job = this.jobRules.requireJob(jobId);
    if (DocumentAgentJobUtil.documentOf(job) !== null) return { stopModes: [], takesFresh: false, takesMessage: false };
    return {
      stopModes:    [...STOP_MODES_OF_A_LIVE_JOB],
      takesFresh:   JobControlRuleUtil.freshAgentIsOpenTo(job),
      takesMessage: JobControlRuleUtil.messageIsOpenTo(job),
    };
  }

  private openTicketKindsOf(ticket: Readonly<Ticket>, priorityChoices: readonly TicketPriority[], mergeWait: MergeForecast | null): Record<TicketOfferKind, boolean> {
    const { id: ticketId, status } = ticket.frontmatter;
    const deliveryByHandIsOpen = this.liveJobOfTicket(ticketId) === undefined && TicketMoveUtil.moveVerdictOf(ticketId, status, 'delivered', false).verdict === 'open';
    return {
      'ticket-ready':           this.ticketMoves.userReadyIsOpenTo(ticket),
      'ticket-hold':            TicketSettingRuleUtil.holdRefusalOf(ticket.frontmatter, 'hold') === null,
      'ticket-unhold':          TicketSettingRuleUtil.holdRefusalOf(ticket.frontmatter, 'unhold') === null,
      // A park lifts any hold and holds the ticket parked, so it takes every ticket whose hold can change.
      'ticket-park':            TicketSettingRuleUtil.holdCanChange(status),
      'ticket-network':         TicketSettingRuleUtil.networkCanChange(status),
      'ticket-priority':        priorityChoices.length > 0,
      'ticket-deliver-by-hand': deliveryByHandIsOpen,
      'merge-accept':           this.records.mergeApprovalIsOn() && mergeWait === 'clean',
      'merge-update':           this.mergeUpdateIsOpenTo(ticketId),
    };
  }
}
