/**
 * Product-owner sessions in the page's board contract for the Intake specs: a product-owner job with its live facts, a log record a session
 * job left, an open question a session asked, an example board of sessions, and a board of the fixture's tracker that holds only the given
 * jobs, decisions, records and tickets. Test-only.
 */
import type { BoardDecisionDocument, BoardQuestionHistoryEntryDocument } from '../../@types/board/BoardDecisionDocuments.ts';
import type { BoardDocument }                                            from '../../@types/board/BoardDocument.ts';
import type { BoardJobDocument, BoardJobLiveFactsDocument }              from '../../@types/board/BoardJobDocuments.ts';
import type { BoardTicketDocument }                                      from '../../@types/board/BoardTicketDocuments.ts';
import type { IntakeBoard }                                              from '../shared/tickets/IntakeSessionsModel.ts';
import { boardStateFixture, exampleAgentJob, exampleTicket }             from './BoardStateFixture.ts';

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

/** An open question a product-owner session asked. */
export function intakeDecision(id: string, jobId: string, openedAt = EXAMPLE_SESSION_RECORD_AT): BoardDecisionDocument {
  return {
    id, kind: 'agent-question', ticketIds: [], jobId, askedBy: 'product-owner', questions: [], context: '', openedAt, document: null, anchor: null, placement: null,
  };
}

/** Live, reopened, stopped, failed and closed sessions, one waiting on User, and the tickets they filed. */
export const EXAMPLE_INTAKE_BOARD: IntakeBoard = {
  jobs: [
    productOwnerJob({ id: 'J7', state: 'running', intake: { text: 'Also JSON', title: null } }, {
      calls:    7,
      turn:     'mid-turn',
      lastLine: { role: 'assistant', text: 'Read src/export.ts', at: null },
    }),
    productOwnerJob({ id: 'J9', state: 'waiting-for-answer', intake: { text: 'Saved baskets', title: 'Baskets across devices' } }),
    productOwnerJob({ id: 'J8', state: 'running', intake: { text: 'Size guide', title: null } }),
  ],
  decisions: [intakeDecision('E5', 'J9')],
  page:      {
    tickets: [
      exampleTicket({
        id: '060', title: 'Export as CSV', status: 'draft', filedByJob: 'J7'
      }),
      exampleTicket({
        id: '061', title: 'Older', status: 'committed', filedByJob: 'J2'
      }),
      exampleTicket({
        id: '062', title: 'Older still', status: 'draft', filedByJob: 'J2'
      }),
    ]
  },
  questionHistory: [
    sessionRecord('job-launched', 'J2', { kind: 'product-owner', ticketIds: [], intakeText: 'Reorder button' }),
    sessionRecord('intake-titled', 'J2', { title: 'Reorder' }),
    sessionRecord('intake-titled', 'J2', { title: 'Reorder requests' }),
    sessionRecord('job-ended', 'J2', { outcome: 'closed' }),
    sessionRecord('job-launched', 'J3', { kind: 'product-owner', ticketIds: [] }),
    sessionRecord('job-ended', 'J3', { outcome: 'closed' }),
    sessionRecord('job-launched', 'J5', { kind: 'product-owner', ticketIds: [] }),
    sessionRecord('job-ended', 'J5', { outcome: 'stopped' }),
    sessionRecord('job-launched', 'J7', { kind: 'product-owner', ticketIds: [], intakeText: 'Add an export\nas CSV' }),
    sessionRecord('job-ended', 'J7', { outcome: 'closed' }),
    sessionRecord('job-launched', 'J8', { kind: 'product-owner', ticketIds: [] }),
    sessionRecord('job-launched', 'J9', { kind: 'product-owner', ticketIds: [] }),
    sessionRecord('job-launched', 'J10', { kind: 'assistant', ticketIds: [] }),
    sessionRecord('job-ended', 'J10', { outcome: 'closed' }),
    sessionRecord('job-launched', 'J11', { kind: 'product-owner', ticketIds: [], intakeText: 'Gift wrap' }),
    sessionRecord('job-ended', 'J11', { outcome: 'failed' }),
  ],
};
