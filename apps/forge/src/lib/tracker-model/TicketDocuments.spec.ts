/**
 * The queries and the delivery mark of a ticket's documents, which Hephaestus's sessions run on before the other moves exist. What matters:
 * a ticket without a record has no document and no standing; standings come from the record; the next message is the oldest one still
 * queued, never a sent or withdrawn one; and marking it sent records its delivery and turn and marks the record for the hold to write,
 * while a message that is unknown or no longer queued is refused and changes nothing.
 */
import { describe, expect, test } from 'bun:test';

import { boardFixture }                                                     from '../../testing/BoardFixtures.ts';
import type { DocumentMessage, LoadedTicketDocumentRecord, TicketDocument } from './@types/TicketDocument.ts';
import { BoardRefusal }                                                     from './BoardRefusal.ts';
import { TicketDocumentVersionUtil }                                        from './utils/TicketDocumentVersionUtil.ts';

const SPEC_TEXT = '# Example spec\n\n## Acceptance\n\n1. Alex Example sees the basket.\n';

function messageOf(messageId: string, state: DocumentMessage['state']): DocumentMessage {
  return {
    messageId, text: `Example message ${messageId}`, from: 'person', state, queuedAt: '2026-11-24T10:00:00.000Z'
  };
}

function specWith(messages: DocumentMessage[]): TicketDocument {
  return {
    kind:     'spec',
    versions: [{
      number: 1, contentHash: TicketDocumentVersionUtil.contentHashOf(SPEC_TEXT), author: 'agent', jobId: 'J4', at: '2026-11-24T09:30:00.000Z'
    }],
    approvals:          [],
    messages,
    proposals:          [],
    proposalMode:       'ask-first',
    readyAtNumber:      1,
    nextMessageNumber:  messages.length + 1,
    nextCommentNumber:  1,
    nextProposalNumber: 1,
  };
}

function loadedRecordWith(messages: DocumentMessage[]): LoadedTicketDocumentRecord {
  return {
    record: {
      version: 1, ticketId: '004', openedAt: '2026-11-24T09:00:00.000Z', documents: [specWith(messages)]
    },
    textOfContentHash: { [TicketDocumentVersionUtil.contentHashOf(SPEC_TEXT)]: SPEC_TEXT },
  };
}

function refusalOf(attempt: () => unknown): unknown {
  try {
    attempt();
  } catch (error) {
    if (error instanceof BoardRefusal) return error.detail;
    throw error;
  }
  throw new Error('the move was not refused');
}

describe('the queries of a ticket\'s documents', () => {
  test('a ticket without a record has no document and no standing', () => {
    const { board } = boardFixture({ ticketDocumentRecords: [loadedRecordWith([])] });
    expect(board.ticketDocuments().documentOf('005', 'spec')).toBeNull();
    expect(board.ticketDocuments().standingOf('005', 'spec')).toBeNull();
  });

  test('a record\'s document and its standing are read from the record, a missing document unwritten', () => {
    const { board } = boardFixture({ ticketDocumentRecords: [loadedRecordWith([])] });
    expect(board.ticketDocuments().documentOf('004', 'spec')?.readyAtNumber).toBe(1);
    expect(board.ticketDocuments().documentOf('004', 'plan')).toBeNull();
    expect(board.ticketDocuments().standingOf('004', 'spec')).toBe('awaiting-review');
    expect(board.ticketDocuments().standingOf('004', 'plan')).toBe('unwritten');
  });

  test('the next message is the oldest one still queued', () => {
    const messages  = [messageOf('M1', 'sent'), messageOf('M2', 'withdrawn'), messageOf('M3', 'queued'), messageOf('M4', 'queued')];
    const { board } = boardFixture({ ticketDocumentRecords: [loadedRecordWith(messages)] });
    expect(board.ticketDocuments().nextQueuedMessageOf('004', 'spec')?.messageId).toBe('M3');
  });

  test('no message is next when none is queued, or the ticket has no record', () => {
    const { board } = boardFixture({ ticketDocumentRecords: [loadedRecordWith([messageOf('M1', 'applied')])] });
    expect(board.ticketDocuments().nextQueuedMessageOf('004', 'spec')).toBeNull();
    expect(board.ticketDocuments().nextQueuedMessageOf('005', 'spec')).toBeNull();
  });
});

describe('markMessageSent', () => {
  test('records the delivery and the turn, and marks the record for the hold to write', () => {
    const loadedRecord = loadedRecordWith([messageOf('M1', 'queued'), messageOf('M2', 'queued')]);
    const { board }    = boardFixture({ ticketDocumentRecords: [loadedRecord] });

    board.ticketDocuments().markMessageSent('004', 'spec', 'M1', 1, 3);

    expect(board.ticketDocuments().documentOf('004', 'spec')?.messages[0]).toMatchObject({ state: 'sent', deliveryNumber: 1, agentTurn: 3 });
    expect(board.ticketDocuments().nextQueuedMessageOf('004', 'spec')?.messageId).toBe('M2');
    expect(board.changedTicketDocumentRecords()).toEqual([loadedRecord]);
  });

  test('refuses a ticket without a record, an unknown message and one no longer queued, and changes nothing', () => {
    const { board } = boardFixture({ ticketDocumentRecords: [loadedRecordWith([messageOf('M1', 'withdrawn')])] });

    expect(refusalOf(() => board.ticketDocuments().markMessageSent('005', 'spec', 'M1', 1, 1))).toEqual({ reason: 'ticket-has-no-documents', ticketId: '005' });
    expect(refusalOf(() => board.ticketDocuments().markMessageSent('004', 'spec', 'M9', 1, 1)))
      .toEqual({
        reason: 'document-unknown-message', ticketId: '004', document: 'spec', messageId: 'M9'
      });
    expect(refusalOf(() => board.ticketDocuments().markMessageSent('004', 'spec', 'M1', 1, 1))).toEqual({
      reason: 'document-message-not-queued', ticketId: '004', document: 'spec', messageId: 'M1', state: 'withdrawn'
    });
    expect(board.changedTicketDocumentRecords()).toEqual([]);
  });
});
