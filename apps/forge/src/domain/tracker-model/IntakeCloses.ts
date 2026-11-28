/**
 * The product owner's close of its intake: the drafts its intake chain filed are submitted, or in the spec-then-plan route each complete
 * one opens its spec and plan, with work outside an entity refused before the job moves.
 */
import type { JobChanged }               from './@types/BoardChanges.ts';
import type { TicketWritingRoute }       from './@types/Pipeline.ts';
import type { ReadinessGap, Ticket }     from './@types/Ticket.ts';
import type { BoardRecords }             from './BoardRecords.ts';
import type { JobControls }              from './JobControls.ts';
import type { Jobs }                     from './Jobs.ts';
import type { TicketDocuments }          from './TicketDocuments.ts';
import type { TicketMoves, WorkFilesOf } from './TicketMoves.ts';
import { DEFAULT_TICKET_WRITING_ROUTE }  from './constants/PipelineDefaults.ts';

export class IntakeCloses {
  constructor(
    private readonly records: BoardRecords,
    private readonly jobRules: Jobs,
    private readonly jobControls: JobControls,
    private readonly ticketMoves: TicketMoves,
    private readonly ticketDocumentRules: TicketDocuments,
  ) {}

  /**
   * The product owner's close submits every draft its intake chain filed: readied, or ready for review when ticket review is on. Work
   * outside an entity (E85) is refused before the job moves, so a corrected retry can still close. In the spec-then-plan `route`,
   * `readinessGapsOf` judges a draft's Report and Wanted: each complete draft stays a draft and opens its spec and plan, which ready it. In a
   * forge with entities a complete draft without one is refused there too, before the job moves, since its documents could never ready it.
   */
  closeIntake(
    jobId: string,
    proposedDraftSets: readonly (readonly string[])[],
    readinessGapsOf: (body: string) => readonly ReadinessGap[],
    at: string,
    workFilesOf?: WorkFilesOf,
    route: TicketWritingRoute = DEFAULT_TICKET_WRITING_ROUTE,
  ): JobChanged {
    if (route === 'spec-then-plan') {
      const completeDrafts = this.draftsFiledByIntakeOf(jobId)
        .filter((ticket) => ticket.frontmatter.status === 'draft' && readinessGapsOf(ticket.body).length === 0);
      this.ticketMoves.refuseASubmitWithoutAnEntity(completeDrafts, false, readinessGapsOf);
      const closed = this.jobControls.closeIntake(jobId, proposedDraftSets, at);
      const opened = completeDrafts.flatMap((ticket) => this.ticketDocumentRules.open(ticket.frontmatter.id, at).logged);
      return { job: closed.job, logged: [...closed.logged, ...opened] };
    }
    const drafts = this.draftsFiledByIntakeOf(jobId);
    if (workFilesOf !== undefined) this.ticketMoves.refuseWorkOutsideTheEntityOfCompleteTickets(drafts, readinessGapsOf, workFilesOf);
    const closed    = this.jobControls.closeIntake(jobId, proposedDraftSets, at);
    const draftIds  = this.draftsFiledByIntakeOf(jobId).map((ticket) => ticket.frontmatter.id);
    const submitted = draftIds.length === 0 ? [] : this.ticketMoves.submitDraftTickets(draftIds, this.records.ticketReviewIsOn(), readinessGapsOf, at, workFilesOf).logged;
    return { job: closed.job, logged: [...closed.logged, ...submitted] };
  }

  /** The drafts a product owner and every session it took over from filed, still drafts. */
  draftsFiledByIntakeOf(jobId: string): readonly Readonly<Ticket>[] {
    const job = this.jobRules.jobById(jobId);
    if (job === undefined) return [];
    const filingJobIds = this.jobControls.intakeChainOf(job);
    return this.records.ticketRecords.filter(({ frontmatter }) => frontmatter.status === 'draft' && frontmatter.filedByJob !== undefined
      && filingJobIds.includes(frontmatter.filedByJob));
  }
}
