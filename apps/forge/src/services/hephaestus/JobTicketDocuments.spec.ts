/**
 * What a build or a review reads of its ticket's documents: a builder the spec and plan at their approved heads, a reviewer the plan once a
 * person approved it; the launch records every document's head, which the document check (`ticketDocumentsUnchanged`) compares.
 */
import { describe, expect, test } from 'bun:test';

import type { Job }                    from '../../domain/tracker-model/@types/Job.ts';
import { PipelineUtil }                from '../../domain/tracker-model/utils/PipelineUtil.ts';
import { TicketDocumentVersionUtil }   from '../../domain/tracker-model/utils/TicketDocumentVersionUtil.ts';
import { boardFixture, ticketFixture } from '../../testing/BoardFixtures.ts';
import { loadedRecordFixture }         from '../../testing/TicketDocumentRecordFixtures.ts';
import { JobTicketDocuments }          from './JobTicketDocuments.ts';

const SPEC = '## Acceptance\n\nA1. The basket shows.\n';
const PLAN = '## Files\n\nWork belongs in: src/Basket.ts\n';

function jobOf(kind: Job['kind']): Readonly<Job> {
  return {
    id: 'J4', kind, role: kind === 'review' ? 'reviewer' : 'builder', ticketIds: ['004'], attempt: 1
  } as unknown as Readonly<Job>;
}

function boardWithDocuments(planApprover: 'person' | 'pipeline'): ReturnType<typeof boardFixture>['board'] {
  const ticket = ticketFixture({ id: '004', status: 'committed' });
  ticket.body = '## Report\n\nEmpty basket.\n';
  return boardFixture({
    tickets:               [ticket],
    pipeline:              { ...PipelineUtil.minimalPipelineOf(), ticketWriting: 'spec-then-plan' },
    ticketDocumentRecords: [loadedRecordFixture('004', {
      spec: { texts: [SPEC], approvals: [{ number: 1, by: 'person' }] },
      plan: { texts: [PLAN], approvals: [{ number: 1, by: planApprover, onSpecNumber: 1 }] },
    })],
  }).board;
}

describe('the documents a job reads', () => {
  test('a builder reads both approved heads; a reviewer the plan only once a person approved it', () => {
    const readBy = (kind: Job['kind'], planApprover: 'person' | 'pipeline'): string[] => JobTicketDocuments
      .ticketDocumentReadingsOf(boardWithDocuments(planApprover), jobOf(kind), '004')
      .map((reading) => `${reading.document} ${reading.versionNumber}`);
    expect(readBy('build', 'pipeline')).toEqual(['spec 1', 'plan 1']);
    expect(readBy('review', 'pipeline')).toEqual(['spec 1']);
    expect(readBy('review', 'person')).toEqual(['spec 1', 'plan 1']);
  });

  test('another job, and a ticket without documents, read none', () => {
    expect(JobTicketDocuments.ticketDocumentReadingsOf(boardWithDocuments('person'), jobOf('product-owner'), '004')).toEqual([]);
    const { board } = boardFixture({ tickets: [ticketFixture({ id: '004' })] });
    expect(JobTicketDocuments.ticketDocumentReadingsOf(board, jobOf('build'), '004')).toEqual([]);
    expect(JobTicketDocuments.ticketDocumentVersionsOf(board, '004')).toBe('');
  });
});

describe('what Customs compares', () => {
  test('the launch records each document\'s head, in pipeline order', () => {
    const versions = JobTicketDocuments.ticketDocumentVersionsOf(boardWithDocuments('person'), '004');
    expect(versions).toBe(`spec:${TicketDocumentVersionUtil.contentHashOf(SPEC)} plan:${TicketDocumentVersionUtil.contentHashOf(PLAN)}`);
  });

  test('V8 reads the approved spec, and V11 the body, the spec and the plan', () => {
    const board  = boardWithDocuments('person');
    const ticket = board.ticketByReference('004');
    if (ticket === undefined) throw new Error('The fixture has no ticket 004.');
    const text = JobTicketDocuments.ticketTextOfCustoms(board, ticket);
    expect(text.acceptanceText).toBe(SPEC);
    expect(text.ticketBody).toContain('src/Basket.ts');
    expect(text.ticketBody).toContain('Empty basket.');
  });
});
