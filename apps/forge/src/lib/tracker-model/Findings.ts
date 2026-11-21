/**
 * The findings a worker files beside its ticket, past their filing: an abandoned finder hands its unstarted findings to User's review,
 * and Hephaestus's first start puts the low tickets v16 left before that review too.
 */
import type { Logged }             from './@types/BoardChanges.ts';
import type { LogRecord }          from './@types/LogRecord.ts';
import type { TicketStatus }       from './@types/Ticket.ts';
import type { BoardRecords }       from './BoardRecords.ts';
import type { Jobs }               from './Jobs.ts';
import type { TicketDependencies } from './TicketDependencies.ts';
import type { TicketMoves }        from './TicketMoves.ts';
import { TicketDefaultsUtil }      from './utils/TicketDefaultsUtil.ts';

const UNSTARTED_STATUSES: readonly TicketStatus[] = ['draft', 'committed', 'ready-for-review'];

const CLOSED_STATUSES: readonly TicketStatus[] = ['delivered', 'abandoned'];

export class Findings {
  constructor(
    private readonly records: BoardRecords,
    private readonly jobRules: Jobs,
    private readonly ticketDependencies: TicketDependencies,
    private readonly ticketMoves: TicketMoves,
  ) {}

  /**
   * In the hold that abandons the finder: each open finding a job of it filed, waiting on it, drops it from `dependsOn`, so none waits on
   * an abandoned ticket; an unstarted one also moves to `ready-for-review`, so User decides whether it still applies.
   */
  releaseFindingsOfAbandoned(finderTicketId: string, at: string): LogRecord[] {
    const jobIds = this.jobIdsOfTicket(finderTicketId);
    const findings = this.records.ticketRecords.filter(({ frontmatter }) => !CLOSED_STATUSES.includes(frontmatter.status)
      && frontmatter.filedByJob !== undefined && jobIds.has(frontmatter.filedByJob)
      && (frontmatter.dependsOn ?? []).includes(finderTicketId));
    return findings.flatMap((finding) => {
      const unlinked = this.ticketDependencies.removeTicketDependencies(finding.frontmatter.id, [finderTicketId], at).logged;
      const unstartedBeforeReview = UNSTARTED_STATUSES.includes(finding.frontmatter.status) && finding.frontmatter.status !== 'ready-for-review';
      const moved                 = unstartedBeforeReview ? [this.ticketMoves.putBeforeReview(finding, at)] : [];
      return [...unlinked, ...moved];
    });
  }

  /**
   * Hephaestus's first start on a board puts every unheld low `committed` ticket v16 left in `ready-for-review`, whatever the ticket review
   * switch says; a board that stored its first Hephaestus start, or whose log holds a `hephaestus-started` record, moves nothing.
   */
  submitFirstRunLeftovers(at: string): Logged {
    const hephaestusStartedBefore = this.records.progress.hephaestusFirstStartedAt !== undefined
      || [...this.records.storedLogRecords, ...this.records.loggedRecords].some((record) => record.kind === 'hephaestus-started');
    if (hephaestusStartedBefore) return { logged: [] };
    const leftovers = this.records.ticketRecords.filter(({ frontmatter }) => frontmatter.status === 'committed'
      && TicketDefaultsUtil.ticketPriorityOf(frontmatter) === 'low' && frontmatter.hold === undefined);
    return { logged: leftovers.map((leftover) => this.ticketMoves.putBeforeReview(leftover, at)) };
  }

  private jobIdsOfTicket(ticketId: string): Set<string> {
    const launched = [...this.records.storedLogRecords, ...this.records.loggedRecords]
      .flatMap((record) => (record.kind === 'job-launched' && record.fields.ticketIds.includes(ticketId) ? [record.jobId] : []));
    const live = this.jobRules.jobs().filter((job) => job.ticketIds.includes(ticketId)).map((job) => job.id);
    return new Set([...launched, ...live]);
  }
}
