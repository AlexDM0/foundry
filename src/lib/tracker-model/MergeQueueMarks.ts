/**
 * The merge-queue mark on a ticket's row: set once its review passed on a tree the Overseer gated green under the current pipeline, while it
 * waits in review to land. Leaving in-review clears it.
 */
import type { Logged }       from './@types/BoardChanges.ts';
import type { Task }         from './@types/Task.ts';
import type { BoardRecords } from './BoardRecords.ts';
import { BoardRefusal }      from './BoardRefusal.ts';
import { PipelineUtil }      from './utils/PipelineUtil.ts';

export class MergeQueueMarks {
  constructor(private readonly records: BoardRecords) {}

  /** Queuing is refused outside in-review; clearing never is, so a refused landing can always take the mark back. */
  setTicketMergeQueued(ticketId: string, queued: boolean, at: string): Readonly<Task> | null {
    const ticket     = this.records.requireTicket(ticketId);
    const { status } = ticket.frontmatter;
    if (!queued) {
      const row = this.records.linkedTaskRecordOf(ticket) ?? null;
      if (row !== null) {
        delete row.mergeQueued;
        delete row.mergeAccepted;
      }
      return row;
    }
    if (status !== 'in-review') throw new BoardRefusal({ reason: 'merge-queue-of-a-ticket-not-in-review', ticketId, status });
    const row       = this.records.ensureTaskForTicket(ticket, at);
    row.mergeQueued = true;
    return row;
  }

  /**
   * A passing review's queuing: the mark, and the `merge-queued` record whose place in the log is the ticket's readiness to land. Refused
   * unless the ticket's green is current on `headTree`, the tree of its branch HEAD as git read it.
   */
  queueTicketForMerge(ticketId: string, target: string, headTree: string | null, at: string): Logged {
    if (!this.greenIsCurrent(ticketId, headTree)) throw new BoardRefusal({ reason: 'merge-queue-without-a-current-green', ticketId, headTree });
    this.setTicketMergeQueued(ticketId, true, at);
    return { logged: [this.records.logger.log({ kind: 'merge-queued', ticketId, fields: { target } }, at)] };
  }

  /**
   * User's accept of a ticket waiting for merge: refused unless merge approval is on and the ticket is queued; the caller judged the
   * merge prediction. Clearing never is refused.
   */
  setTicketMergeAccepted(ticketId: string, accepted: boolean, at: string): Logged & { changed?: false } {
    const ticket = this.records.requireTicket(ticketId);
    const row    = this.records.linkedTaskRecordOf(ticket);
    if (!accepted) {
      if (row?.mergeAccepted !== true) return { logged: [], changed: false };
      delete row.mergeAccepted;
      return { logged: [this.records.logger.log({ kind: 'merge-acceptance-set', ticketId, fields: { state: 'cleared' } }, at)] };
    }
    if (this.records.pipeline?.approvals?.merge !== true) throw new BoardRefusal({ reason: 'merge-approval-off', ticketId });
    if (row?.mergeQueued !== true) throw new BoardRefusal({ reason: 'merge-accept-of-a-ticket-not-waiting', ticketId, status: ticket.frontmatter.status });
    if (row.mergeAccepted === true) return { logged: [], changed: false };
    row.mergeAccepted = true;
    return { logged: [this.records.logger.log({ kind: 'merge-acceptance-set', ticketId, fields: { state: 'accepted' } }, at)] };
  }

  /** `merge update` ran: a merged target leaves the queue mark for the Overseer's gate run, a conflicted one takes the ticket out of the queue. */
  recordMergeUpdated(ticketId: string, target: string, outcome: 'merged' | 'conflicted', at: string): Logged {
    if (outcome === 'conflicted') this.setTicketMergeQueued(ticketId, false, at);
    return { logged: [this.records.logger.log({ kind: 'merge-updated', ticketId, fields: { target, outcome } }, at)] };
  }

  ticketIsMergeAccepted(ticketId: string): boolean {
    const ticket = this.records.ticketRecordById(ticketId);
    return ticket !== undefined && this.records.linkedTaskRecordOf(ticket)?.mergeAccepted === true;
  }

  ticketIsMergeQueued(ticketId: string): boolean {
    const ticket = this.records.ticketRecordById(ticketId);
    return ticket !== undefined && this.records.linkedTaskRecordOf(ticket)?.mergeQueued === true;
  }

  /** The row's `greenTree` is `headTree` and its `pipelineHash` the stored pipeline's: the Overseer gated exactly this tree under these gates. */
  greenIsCurrent(ticketId: string, headTree: string | null): boolean {
    const ticket = this.records.ticketRecordById(ticketId);
    const row    = ticket === undefined ? undefined : this.records.linkedTaskRecordOf(ticket);
    const { pipeline } = this.records;
    return headTree !== null && pipeline !== null && row?.greenTree === headTree && row.pipelineHash === PipelineUtil.pipelineHashOf(pipeline);
  }
}
