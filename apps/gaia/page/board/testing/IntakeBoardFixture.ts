/**
 * Product-owner sessions in the page's board contract for the Intake specs: a product-owner job with its live facts, a log record a session
 * job left, and a board of the fixture's tracker that holds only the given jobs, decisions, records and tickets. Test-only.
 */
import type { BoardQuestionHistoryEntryDocument }           from '../../@types/board/BoardDecisionDocuments.ts';
import type { BoardDocument }                               from '../../@types/board/BoardDocument.ts';
import type { BoardJobDocument, BoardJobLiveFactsDocument } from '../../@types/board/BoardJobDocuments.ts';
import type { BoardTicketDocument }                         from '../../@types/board/BoardTicketDocuments.ts';
import { boardStateFixture, exampleAgentJob }               from './BoardStateFixture.ts';

export const EXAMPLE_SESSION_RECORD_AT = '2026-10-29T20:00:00+01:00';

export function productOwnerJob(
  changes: Partial<BoardJobDocument> & Pick<BoardJobDocument, 'id' | 'state' | 'intake'>,
  live: Partial<BoardJobLiveFactsDocument> = {},
): BoardJobDocument {
  const job = exampleAgentJob({
    kind: 'product-owner', role: 'productOwner', ticketIds: [], ...changes
  });
  return { ...job, live: { ...job.live, ...live } };
}

export function sessionRecord(kind: string, jobId: string, fields: Readonly<Record<string, unknown>>): BoardQuestionHistoryEntryDocument {
  return {
    kind, at: EXAMPLE_SESSION_RECORD_AT, jobId, ticketId: null, decisionId: null, incidentId: null, fields
  };
}

export interface IntakeBoardContents {
  readonly jobs:            readonly BoardJobDocument[];
  readonly decisions?:      BoardDocument['decisions'];
  readonly questionHistory: readonly BoardQuestionHistoryEntryDocument[];
  readonly tickets?:        readonly BoardTicketDocument[];
  readonly pictureLimits?:  BoardDocument['pictureLimits'];
}

export function intakeBoardOf(contents: IntakeBoardContents): BoardDocument {
  const board = boardStateFixture();
  return {
    ...board,
    jobs:            contents.jobs,
    decisions:       contents.decisions ?? [],
    questionHistory: contents.questionHistory,
    page:            { ...board.page, tickets: contents.tickets ?? [] },
    pictureLimits:   contents.pictureLimits ?? null,
    openDecisionIds: (contents.decisions ?? []).map((decision) => decision.id),
  };
}
