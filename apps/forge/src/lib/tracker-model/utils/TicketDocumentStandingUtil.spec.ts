/**
 * Where a ticket document stands. What matters: each of the six standings is reached by the facts the plan names and no others; staleness
 * is judged on content hashes, never on stamps; a plan approved on a spec version that is no longer the spec's approved head is out of
 * date, also while the spec waits for its next approval; and a record that lacks a document reads it unwritten.
 */
import { describe, expect, test } from 'bun:test';

import type {
  DocumentApproval,
  DocumentVersion,
  TicketDocument,
  TicketDocumentKind,
  TicketDocumentRecord
} from '../@types/TicketDocument.ts';
import { TicketDocumentStandingUtil } from './TicketDocumentStandingUtil.ts';
import { TicketDocumentVersionUtil }  from './TicketDocumentVersionUtil.ts';

const { standingOf, standingsOf } = TicketDocumentStandingUtil;

function versionOf(versionNumber: number, text: string): DocumentVersion {
  return {
    number: versionNumber, contentHash: TicketDocumentVersionUtil.contentHashOf(text), author: 'agent', jobId: 'J4', at: '2026-11-24T10:00:00.000Z'
  };
}

function approvalOf(version: Readonly<DocumentVersion>, onSpec: Readonly<DocumentVersion> | null = null): DocumentApproval {
  return {
    number:             version.number,
    contentHash:        version.contentHash,
    by:                 'person',
    at:                 '2026-11-24T11:00:00.000Z',
    constitutionCommit: 'abc1234',
    ...(onSpec === null ? {} : { onSpecNumber: onSpec.number, onSpecContentHash: onSpec.contentHash }),
  };
}

function documentOf(kind: TicketDocumentKind, versions: DocumentVersion[], approvals: DocumentApproval[] = [], readyAtNumber?: number): TicketDocument {
  return {
    kind,
    versions,
    approvals,
    messages:           [],
    proposals:          [],
    proposalMode:       'ask-first',
    ...(readyAtNumber === undefined ? {} : { readyAtNumber }),
    nextMessageNumber:  1,
    nextCommentNumber:  1,
    nextProposalNumber: 1,
  };
}

function recordOf(documents: TicketDocument[]): TicketDocumentRecord {
  return {
    version: 1, ticketId: '004', openedAt: '2026-11-24T09:00:00.000Z', documents
  };
}

const SPEC_FIVE = versionOf(5, '# Spec\n\nVersion five.\n');
const SPEC_SIX  = versionOf(6, '# Spec\n\nVersion six.\n');
const PLAN_TWO  = versionOf(2, '# Plan\n\nVersion two.\n');

describe('standingOf', () => {
  test('a document with no version is unwritten', () => {
    expect(standingOf(documentOf('spec', []), null)).toBe('unwritten');
  });

  test('a document its agent has not called ready at the head is drafting', () => {
    expect(standingOf(documentOf('spec', [SPEC_FIVE], [], 4), null)).toBe('drafting');
  });

  test('a document its agent called ready at the head awaits review', () => {
    expect(standingOf(documentOf('spec', [SPEC_FIVE], [], 5), null)).toBe('awaiting-review');
  });

  test('a document approved at its head is approved', () => {
    expect(standingOf(documentOf('spec', [SPEC_FIVE], [approvalOf(SPEC_FIVE)]), null)).toBe('approved');
  });

  test('a document changed after its approval reads changed since approval, even when its agent called the new head ready', () => {
    expect(standingOf(documentOf('spec', [SPEC_FIVE, SPEC_SIX], [approvalOf(SPEC_FIVE)], 6), null)).toBe('changed-since-approval');
  });

  test('a plan approved on the spec\'s approved head is approved', () => {
    const plan = documentOf('plan', [PLAN_TWO], [approvalOf(PLAN_TWO, SPEC_FIVE)]);
    expect(standingOf(plan, SPEC_FIVE.contentHash)).toBe('approved');
  });

  test('a plan approved on an older spec version is out of date', () => {
    const plan = documentOf('plan', [PLAN_TWO], [approvalOf(PLAN_TWO, SPEC_FIVE)]);
    expect(standingOf(plan, SPEC_SIX.contentHash)).toBe('out-of-date');
  });

  test('a plan approved while the spec waits for its next approval is out of date', () => {
    const plan = documentOf('plan', [PLAN_TWO], [approvalOf(PLAN_TWO, SPEC_FIVE)]);
    expect(standingOf(plan, null)).toBe('out-of-date');
  });

  test('the spec ignores the spec hash it is handed', () => {
    expect(standingOf(documentOf('spec', [SPEC_FIVE], [approvalOf(SPEC_FIVE)]), 'ffffffffffffffff')).toBe('approved');
  });
});

describe('standingsOf', () => {
  test('judges the plan against the spec of the same record', () => {
    const spec = documentOf('spec', [SPEC_FIVE, SPEC_SIX], [approvalOf(SPEC_FIVE), approvalOf(SPEC_SIX)]);
    const plan = documentOf('plan', [PLAN_TWO], [approvalOf(PLAN_TWO, SPEC_FIVE)]);
    expect(standingsOf(recordOf([spec, plan]))).toEqual({ spec: 'approved', plan: 'out-of-date' });
  });

  test('reads a document the record does not hold as unwritten', () => {
    expect(standingsOf(recordOf([documentOf('spec', [SPEC_FIVE], [], 5)]))).toEqual({ spec: 'awaiting-review', plan: 'unwritten' });
  });
});
