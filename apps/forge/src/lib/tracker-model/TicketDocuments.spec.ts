/**
 * A ticket's spec and plan moves. What matters: a ticket without a record has no document and no standing; the next message is the oldest
 * one still queued, and marking it sent records its delivery; a save makes a version unless its text equals the head, merges with an
 * agent's newer version (User's text winning where the two overlap, the agent's edit conflicted and told) and is refused where two of
 * User's saves overlap; a proposal lands on User's newer text only where its lines still stand, the first write applies at once, and Edit
 * first applies User's lines; comments move with a replace hunk and are orphaned when their lines go; only the head is approved, only by
 * User with the review on, and a spec without numbered Acceptance never; the approval that leaves both documents approved readies the draft
 * in the same write, E85 read from the plan; a changed spec leaves the plan out of date, its approval kept; and nothing is edited after
 * pickup.
 */
import {
  describe,
  expect,
  mock,
  test
} from 'bun:test';

import type { BoardFixture } from '../../testing/BoardFixtures.ts';
import {
  boardFixture,
  entityPipelineFixture,
  refusalDetailOf,
  ticketFixture
} from '../../testing/BoardFixtures.ts';
import type { Pipeline }     from './@types/Pipeline.ts';
import type { TicketStatus } from './@types/Ticket.ts';
import type {
  CommentAnchor,
  DocumentMessage,
  LoadedTicketDocumentRecord,
  TicketDocument,
  TicketDocumentKind
} from './@types/TicketDocument.ts';
import type { Board }                from './Board.ts';
import { BoardRefusal }              from './BoardRefusal.ts';
import type { DocumentMoveJudges }   from './TicketDocuments.ts';
import type { WorkFilesOf }          from './TicketMoves.ts';
import { PipelineUtil }              from './utils/PipelineUtil.ts';
import { TicketDocumentVersionUtil } from './utils/TicketDocumentVersionUtil.ts';

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

const AT = '2026-11-24T11:00:00.000Z';

const NUMBERED_SPEC = '# Example spec\n\n## Outcome\n\nAlex Example sees the basket.\n\n## Acceptance\n\nA1. The basket shows two items.\n';

const PLAN_TEXT = '# Example plan\n\n## Files\n\nWork belongs in: apps/web/src/Basket.ts\n';

interface RouteBoardOptions {
  status?:    TicketStatus;
  approvals?: Pipeline['approvals'];
  entities?:  boolean;
}

/** A forge in the spec-then-plan route with draft `004`, its Report and Wanted written, and no documents record yet. */
function routeBoard(options: RouteBoardOptions = {}): BoardFixture {
  const basePipeline = options.entities === true ? entityPipelineFixture() : PipelineUtil.minimalPipelineOf();
  const pipeline: Pipeline = { ...basePipeline, ticketWriting: 'spec-then-plan', ...(options.approvals === undefined ? {} : { approvals: options.approvals }) };
  const ticket = ticketFixture({ id: '004', status: options.status ?? 'draft', ...(options.entities === true ? { entity: 'web' } : {}) });
  ticket.body = '## Report\n\nThe basket is empty.\n\n## Wanted\n\nThe basket shows its items.\n';
  return boardFixture({ tickets: [ticket], pipeline });
}

/** The body judge a caller injects: a numbered Acceptance item, as `A1.`, closes the only gap the documents read. */
function judgesWith(workFilesOf: WorkFilesOf = () => []): DocumentMoveJudges {
  return {
    bodyGapsOf:       (body) => (/^A\d+\./mu.test(body) ? [] : ['acceptance-unnumbered']),
    workFilesOf,
    conflictNoticeOf: (proposal) => `Example notice: ${proposal.proposalId} conflicted.`,
  };
}

function textOfHead(board: Board, document: TicketDocumentKind): string | null {
  const head = board.ticketDocuments().documentOf('004', document)?.versions.at(-1);
  return head === undefined ? null : board.ticketDocuments().versionTextOf('004', document, head.number);
}

/** The spec written by the agent at version 1 and approved by User, so the plan may be written. */
function boardWithApprovedSpec(options: RouteBoardOptions = {}): BoardFixture {
  const fixture = routeBoard(options);
  const documents = fixture.board.ticketDocuments();
  documents.open('004', AT);
  documents.propose('004', 'spec', 'J4', {
    baseNumber: null,
    edits:      [{
      fromLine: 1, toLine: 0, originalLines: [], replacementLines: NUMBERED_SPEC.split('\n')
    }],
    summary: 'First spec'
  }, 'c1', judgesWith(), AT);
  if (options.approvals?.spec === false) documents.markReady('004', 'spec', 'c1', judgesWith(), AT);
  else documents.approve('004', 'spec', 1, 'c1', judgesWith(), AT);
  return fixture;
}

describe('saves', () => {
  test('a save makes a version, and a text equal to the head makes none', () => {
    const { board } = routeBoard();
    const first = board.ticketDocuments().save('004', 'spec', null, NUMBERED_SPEC, judgesWith(), AT);
    expect(first).toMatchObject({ changed: true, versionNumber: 1 });
    expect(first.logged.map((record) => record.kind)).toEqual(['ticket-documents-opened', 'ticket-document-versioned']);
    const again = board.ticketDocuments().save('004', 'spec', 1, NUMBERED_SPEC, judgesWith(), AT);
    expect(again).toEqual({ changed: false, versionNumber: 1, logged: [] });
    expect(textOfHead(board, 'spec')).toBe(NUMBERED_SPEC);
  });

  test('a save on an older version merges with an agent\'s newer version where the two changed other lines', () => {
    const { board } = routeBoard();
    const documents = board.ticketDocuments();
    documents.save('004', 'spec', null, 'one\ntwo\nthree\nfour', judgesWith(), AT);
    documents.propose('004', 'spec', 'J4', {
      baseNumber: 1,
      edits:      [{
        fromLine: 4, toLine: 4, originalLines: ['four'], replacementLines: ['FOUR']
      }],
      summary: 'Agent edit'
    }, 'c1', judgesWith(), AT);
    documents.setProposalMode('004', 'spec', 'auto-apply', AT);
    documents.propose('004', 'spec', 'J4', {
      baseNumber: 1,
      edits:      [{
        fromLine: 4, toLine: 4, originalLines: ['four'], replacementLines: ['FOUR']
      }],
      summary: 'Agent edit'
    }, 'c1', judgesWith(), AT);
    expect(textOfHead(board, 'spec')).toBe('one\ntwo\nthree\nFOUR');

    documents.save('004', 'spec', 1, 'ONE\ntwo\nthree\nfour', judgesWith(), AT);

    expect(textOfHead(board, 'spec')).toBe('ONE\ntwo\nthree\nFOUR');
  });

  test('where User\'s save overlaps an agent\'s version, User\'s text wins, the agent\'s edit is conflicted and the agent is told', () => {
    const { board } = routeBoard();
    const documents = board.ticketDocuments();
    documents.save('004', 'spec', null, 'one\ntwo', judgesWith(), AT);
    documents.setProposalMode('004', 'spec', 'auto-apply', AT);
    documents.propose('004', 'spec', 'J4', {
      baseNumber: 1,
      edits:      [{
        fromLine: 2, toLine: 2, originalLines: ['two'], replacementLines: ['agent two']
      }],
      summary: 'Agent edit'
    }, 'c1', judgesWith(), AT);

    documents.save('004', 'spec', 1, 'one\nUser two', judgesWith(), AT);

    expect(textOfHead(board, 'spec')).toBe('one\nUser two');
    const spec = documents.documentOf('004', 'spec');
    expect(spec?.proposals.at(-1)).toMatchObject({ state: 'conflicted', jobId: 'J4', baseNumber: 1 });
    expect(spec?.messages.at(-1)).toMatchObject({ from: 'board', state: 'queued', text: `Example notice: ${spec?.proposals.at(-1)?.proposalId} conflicted.` });
  });

  test('two saves of User that overlap are refused as a merge conflict, and nothing changes', () => {
    const { board } = routeBoard();
    const documents = board.ticketDocuments();
    documents.save('004', 'spec', null, 'one\ntwo', judgesWith(), AT);
    documents.save('004', 'spec', 1, 'one\nfirst tab', judgesWith(), AT);
    expect(refusalDetailOf(() => documents.save('004', 'spec', 1, 'one\nsecond tab', judgesWith(), AT))).toEqual({
      reason: 'document-merge-conflict', ticketId: '004', document: 'spec', baseNumber: 1, headNumber: 2
    });
  });

  test('a save names a version the document has, and stays under the character limit', () => {
    const { board } = routeBoard();
    const documents = board.ticketDocuments();
    documents.save('004', 'spec', null, 'one', judgesWith(), AT);
    expect(refusalDetailOf(() => documents.save('004', 'spec', null, 'two', judgesWith(), AT))).toMatchObject({ reason: 'document-version-moved', version: null, headNumber: 1 });
    expect(refusalDetailOf(() => documents.save('004', 'spec', 1, 'x'.repeat(200_001), judgesWith(), AT))).toMatchObject({ reason: 'document-too-long', characterCount: 200_001 });
  });

  test('a ticket outside the route has no documents to save, and a plan waits for an approved spec', () => {
    const { board } = boardFixture({ tickets: [ticketFixture({ id: '004', status: 'draft' })] });
    expect(refusalDetailOf(() => board.ticketDocuments().save('004', 'spec', null, 'one', judgesWith(), AT))).toEqual({ reason: 'ticket-has-no-documents', ticketId: '004' });
    const route = routeBoard();
    const planSave = (): unknown => route.board.ticketDocuments().save('004', 'plan', null, PLAN_TEXT, judgesWith(), AT);
    expect(refusalDetailOf(planSave)).toEqual({ reason: 'plan-before-approved-spec', ticketId: '004' });
  });
});

describe('proposals', () => {
  test('the first write applies at once though the agent asks first, as the agent\'s version', () => {
    const { board } = routeBoard();
    board.ticketDocuments().open('004', AT);
    const proposed = board.ticketDocuments().propose('004', 'spec', 'J4', {
      baseNumber: null,
      edits:      [{
        fromLine: 1, toLine: 0, originalLines: [], replacementLines: ['first']
      }],
      summary: 'First'
    }, 'c1', judgesWith(), AT);
    expect(proposed.proposal).toMatchObject({ proposalId: 'P1', state: 'applied', appliedNumber: 1 });
    expect(board.ticketDocuments().documentOf('004', 'spec')?.versions[0]).toMatchObject({ author: 'agent', jobId: 'J4', constitutionCommit: 'c1' });
  });

  test('a proposal made on an older version lands on User\'s newer text when its lines still stand', () => {
    const { board } = routeBoard();
    const documents = board.ticketDocuments();
    documents.save('004', 'spec', null, 'one\ntwo\nthree', judgesWith(), AT);
    documents.propose('004', 'spec', 'J4', {
      baseNumber: 1,
      edits:      [{
        fromLine: 3, toLine: 3, originalLines: ['three'], replacementLines: ['agent three']
      }],
      summary: 'Edit'
    }, 'c1', judgesWith(), AT);
    documents.save('004', 'spec', 1, 'zero\none\ntwo\nthree', judgesWith(), AT);

    documents.applyProposal('004', 'spec', 'P1', null, judgesWith(), AT);

    expect(textOfHead(board, 'spec')).toBe('zero\none\ntwo\nagent three');
    expect(documents.documentOf('004', 'spec')?.proposals[0]).toMatchObject({ state: 'applied', appliedNumber: 3 });
  });

  test('a proposal whose lines User changed meanwhile is conflicted, and a board message tells the agent', () => {
    const { board } = routeBoard();
    const documents = board.ticketDocuments();
    documents.save('004', 'spec', null, 'one\ntwo', judgesWith(), AT);
    documents.propose('004', 'spec', 'J4', {
      baseNumber: 1,
      edits:      [{
        fromLine: 2, toLine: 2, originalLines: ['two'], replacementLines: ['agent two']
      }],
      summary: 'Edit'
    }, 'c1', judgesWith(), AT);
    documents.save('004', 'spec', 1, 'one\nUser two', judgesWith(), AT);

    documents.applyProposal('004', 'spec', 'P1', null, judgesWith(), AT);

    expect(textOfHead(board, 'spec')).toBe('one\nUser two');
    expect(documents.documentOf('004', 'spec')?.proposals[0]?.state).toBe('conflicted');
    expect(documents.nextQueuedMessageOf('004', 'spec')).toMatchObject({ from: 'board', text: 'Example notice: P1 conflicted.' });
  });

  test('Edit first applies User\'s lines in the agent\'s place, as User\'s version, and settles the message it answers', () => {
    const { board } = routeBoard();
    const documents = board.ticketDocuments();
    documents.save('004', 'spec', null, 'one\ntwo', judgesWith(), AT);
    const anchor: CommentAnchor = {
      view: 'code', versionNumber: 1, lines: { from: 2, to: 2 }, sectionPath: [], surroundingLines: { from: 1, to: 2 }
    };
    documents.comment('004', 'spec', anchor, 'Say more', AT);
    documents.propose('004', 'spec', 'J4', {
      baseNumber: 1,
      edits:      [{
        fromLine: 2, toLine: 2, originalLines: ['two'], replacementLines: ['agent two']
      }],
      summary:          'Edit',
      answersMessageId: 'M1'
    }, 'c1', judgesWith(), AT);

    documents.applyProposal('004', 'spec', 'P1', [['User two', 'and more']], judgesWith(), AT);

    expect(textOfHead(board, 'spec')).toBe('one\nUser two\nand more');
    expect(documents.documentOf('004', 'spec')?.versions.at(-1)?.author).toBe('person');
    expect(documents.documentOf('004', 'spec')?.messages[0]).toMatchObject({ state: 'applied', placement: { from: 2, to: 3 } });
    expect(refusalDetailOf(() => documents.discardProposal('004', 'spec', 'P1', AT))).toMatchObject({ reason: 'document-proposal-not-open', state: 'applied' });
  });
});

describe('messages', () => {
  test('messages queue in order, and only a queued one is withdrawn', () => {
    const { board } = routeBoard();
    const documents = board.ticketDocuments();
    documents.comment('004', 'spec', null, 'First', AT);
    documents.comment('004', 'spec', null, 'Second', AT);
    documents.markMessageSent('004', 'spec', 'M1', 1, 1);

    expect(documents.withdrawComment('004', 'spec', 'M2')).toEqual({ changed: true, logged: [] });
    expect(documents.nextQueuedMessageOf('004', 'spec')).toBeNull();
    expect(refusalDetailOf(() => documents.withdrawComment('004', 'spec', 'M1'))).toMatchObject({ reason: 'document-message-not-queued', state: 'sent' });
    expect(refusalDetailOf(() => documents.withdrawComment('004', 'spec', 'M9'))).toMatchObject({ reason: 'document-unknown-message' });
  });

  test('a comment\'s placement moves with a replace hunk and is orphaned when its lines are deleted, its quote kept', () => {
    const { board } = routeBoard();
    const documents = board.ticketDocuments();
    documents.save('004', 'spec', null, 'one\ntwo\nthree\nfour', judgesWith(), AT);
    const anchorOn = (line: number, quote: string): CommentAnchor => ({
      view: 'preview', versionNumber: 1, lines: { from: line, to: line }, sectionPath: ['Outcome'], quote, surroundingLines: { from: 1, to: 4 }
    });
    documents.comment('004', 'spec', anchorOn(2, 'two'), 'On two', AT);
    documents.comment('004', 'spec', anchorOn(4, 'four'), 'On four', AT);

    documents.save('004', 'spec', 1, 'zero\none\ntwo and more\nthree', judgesWith(), AT);

    const [onTwo, onFour] = documents.documentOf('004', 'spec')?.messages ?? [];
    expect(onTwo).toMatchObject({ commentNumber: 1, placement: { from: 3, to: 3 } });
    expect(onFour).toMatchObject({ commentNumber: 2, orphaned: true, anchor: { quote: 'four' } });
    expect(onFour?.placement).toBeUndefined();
  });

  test('edits and comments are refused once an agent picked the ticket up', () => {
    const fixture = boardWithApprovedSpec();
    const [ticket] = fixture.tickets;
    if (ticket !== undefined) ticket.frontmatter.status = 'in-progress';
    const documents = fixture.board.ticketDocuments();
    const notEditable = {
      reason: 'document-not-editable', ticketId: '004', document: 'spec', status: 'in-progress'
    } as const;
    expect(refusalDetailOf(() => documents.save('004', 'spec', 1, 'changed', judgesWith(), AT))).toEqual(notEditable);
    expect(refusalDetailOf(() => documents.comment('004', 'spec', null, 'Late', AT))).toEqual(notEditable);
  });
});

describe('approvals', () => {
  test('User approves only the head, and only while the review is on', () => {
    const { board } = routeBoard();
    const documents = board.ticketDocuments();
    documents.save('004', 'spec', null, NUMBERED_SPEC, judgesWith(), AT);
    documents.save('004', 'spec', 1, `${NUMBERED_SPEC}\nMore.\n`, judgesWith(), AT);
    expect(refusalDetailOf(() => documents.approve('004', 'spec', 1, 'c1', judgesWith(), AT))).toEqual({
      reason: 'document-version-moved', ticketId: '004', document: 'spec', version: 1, headNumber: 2
    });
    const reviewOff = boardWithApprovedSpec({ approvals: { spec: false } });
    const approvalWithReviewOff = (): unknown => reviewOff.board.ticketDocuments().approve('004', 'spec', 1, 'c1', judgesWith(), AT);
    expect(refusalDetailOf(approvalWithReviewOff)).toEqual({ reason: 'document-review-is-off', ticketId: '004', document: 'spec' });
    expect(reviewOff.board.ticketDocuments().documentOf('004', 'spec')?.approvals).toEqual([{
      number: 1, contentHash: TicketDocumentVersionUtil.contentHashOf(NUMBERED_SPEC), by: 'pipeline', at: AT, constitutionCommit: 'c1'
    }]);
    expect(refusalDetailOf(() => reviewOff.board.ticketDocuments().save('004', 'spec', 1, 'changed', judgesWith(), AT))).toMatchObject({ reason: 'document-not-editable' });
  });

  test('a spec whose head holds no numbered Acceptance item is not approved', () => {
    const { board } = routeBoard();
    board.ticketDocuments().save('004', 'spec', null, '# Example spec\n\n## Acceptance\n\n1. Not an item.\n', judgesWith(), AT);
    expect(refusalDetailOf(() => board.ticketDocuments().approve('004', 'spec', 1, 'c1', judgesWith(), AT))).toEqual({ reason: 'spec-acceptance-unnumbered', ticketId: '004' });
  });

  test('User\'s approval that leaves both documents approved readies the draft in the same write, its plan read for E85', () => {
    const { board } = boardWithApprovedSpec({ entities: true });
    const workFilesOf = mock((body: string) => (body.includes('apps/web/src/Basket.ts') ? ['/apps/web/src/Basket.ts'] : []));
    board.ticketDocuments().save('004', 'plan', null, PLAN_TEXT, judgesWith(workFilesOf), AT);

    const approved = board.ticketDocuments().approve('004', 'plan', 1, 'c2', judgesWith(workFilesOf), AT);

    expect(approved.logged.map((record) => record.kind)).toEqual(['ticket-document-approved', 'ticket-committed']);
    expect(board.ticketByReference('004')?.frontmatter.status).toBe('committed');
    expect(workFilesOf.mock.calls.some(([body]) => body.startsWith('## Brief') && body.includes('Work belongs in: apps/web/src/Basket.ts'))).toBe(true);
    expect(board.ticketDocuments().documentOf('004', 'plan')?.approvals[0]).toMatchObject({ by: 'person', onSpecNumber: 1 });
  });

  test('a plan naming work outside its entity refuses the approval that would ready the draft (E85)', () => {
    const { board } = boardWithApprovedSpec({ entities: true });
    const judges = judgesWith(() => ['/packages/design-system/Button.ts', '/apps/web/src/Basket.ts', '/infrastructure/main.tf']);
    board.ticketDocuments().save('004', 'plan', null, PLAN_TEXT, judges, AT);
    expect(refusalDetailOf(() => board.ticketDocuments().approve('004', 'plan', 1, 'c2', judges, AT))).toMatchObject({ reason: 'work-outside-entity' });
  });

  test('the pipeline\'s approval at the agent\'s ready readies the draft too, with the review off', () => {
    const { board } = boardWithApprovedSpec({ approvals: { spec: false, plan: false } });
    const documents = board.ticketDocuments();
    documents.propose('004', 'plan', 'J5', {
      baseNumber: null,
      edits:      [{
        fromLine: 1, toLine: 0, originalLines: [], replacementLines: [PLAN_TEXT]
      }],
      summary: 'Plan'
    }, 'c2', judgesWith(), AT);

    const ready = documents.markReady('004', 'plan', 'c2', judgesWith(), AT);

    expect(ready.logged.map((record) => record.kind)).toEqual(['ticket-document-approved', 'ticket-committed']);
    expect(documents.documentOf('004', 'plan')?.approvals[0]).toMatchObject({ by: 'pipeline', onSpecNumber: 1 });
  });

  test('a spec changed after the plan\'s approval leaves the plan out of date, its approval kept', () => {
    const { board } = boardWithApprovedSpec();
    const documents = board.ticketDocuments();
    documents.save('004', 'plan', null, PLAN_TEXT, judgesWith(), AT);
    documents.approve('004', 'plan', 1, 'c2', judgesWith(), AT);

    documents.save('004', 'spec', 1, `${NUMBERED_SPEC}A2. The total shows.\n`, judgesWith(), AT);
    documents.approve('004', 'spec', 2, 'c3', judgesWith(), AT);

    expect(documents.standingOf('004', 'plan')).toBe('out-of-date');
    expect(documents.documentOf('004', 'plan')?.approvals).toHaveLength(1);
    documents.approve('004', 'plan', 1, 'c4', judgesWith(), AT);
    expect(documents.standingOf('004', 'plan')).toBe('approved');
    expect(documents.documentOf('004', 'plan')?.approvals.map((approval) => approval.onSpecNumber)).toEqual([1, 2]);
  });
});
