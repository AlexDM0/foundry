/**
 * A ticket's spec and plan as a build or review job meets them: the readings its role is given, the document versions Customs compares
 * and the text its Acceptance and named-path checks read.
 */
import type { Job }                                        from '../../domain/tracker-model/@types/Job.ts';
import type { Board }                                      from '../../domain/tracker-model/Board.ts';
import { type DocumentReading, TicketDocumentReadingUtil } from '../../domain/tracker-model/utils/TicketDocumentReadingUtil.ts';
import { REVIEW_JOB_KIND }                                 from './WorktreeJobs.ts';

/** The role that reads a build or a review job's ticket documents; `null` for any other job. */
function documentReadingRoleOf(job: Readonly<Job>): 'builder' | 'reviewer' | null {
  if (job.kind === 'build') return 'builder';
  return job.kind === REVIEW_JOB_KIND ? 'reviewer' : null;
}

/** The ticket's spec and plan as the job's role reads them, in pipeline order; none for a ticket without documents or another job. */
function ticketDocumentReadingsOf(board: Board, job: Readonly<Job>, ticketId: string): DocumentReading[] {
  const loadedRecord = board.ticketDocumentRecordOf(ticketId);
  const role         = documentReadingRoleOf(job);
  if (loadedRecord === null || role === null) return [];
  const entityKey = board.tickets().find((candidate) => candidate.frontmatter.id === ticketId)?.frontmatter.entity;
  return TicketDocumentReadingUtil.readingsForRoleOf(loadedRecord, board.pipeline(), role, entityKey);
}

/** Each document's head as `<kind>:<content hash>`, in pipeline order, as Customs compares them; empty for a ticket without documents. */
function ticketDocumentVersionsOf(board: Board, ticketId: string): string {
  const loadedRecord = board.ticketDocumentRecordOf(ticketId);
  if (loadedRecord === null) return '';
  return loadedRecord.record.documents.map((document) => `${document.kind}:${document.versions.at(-1)?.contentHash ?? ''}`).join(' ');
}

/** The text Customs reads the Acceptance and the named paths from: the body, and for a ticket with documents its spec and plan heads. */
function ticketTextOfCustoms(board: Board, ticket: Readonly<{ frontmatter: { id: string }; body: string }>): { ticketBody: string; acceptanceText?: string } {
  const loadedRecord = board.ticketDocumentRecordOf(ticket.frontmatter.id);
  if (loadedRecord === null) return { ticketBody: ticket.body };
  const specText = TicketDocumentReadingUtil.approvedHeadOf(loadedRecord, 'spec')?.text ?? '';
  const planText = TicketDocumentReadingUtil.briefTextOf(loadedRecord) ?? '';
  return { ticketBody: [ticket.body, specText, planText].join('\n'), acceptanceText: specText };
}

export const JobTicketDocuments = Object.freeze({
  ticketDocumentReadingsOf,
  ticketDocumentVersionsOf,
  ticketTextOfCustoms,
});
