/**
 * Where a ticket document stands: each of the six standings is reached by its facts alone, staleness is judged on content hashes, and a
 * plan approved on or written for an older spec version is out of date.
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
const SPEC_APPROVED_AT_FIVE = documentOf('spec', [SPEC_FIVE], [approvalOf(SPEC_FIVE)]);
const SPEC_APPROVED_AT_SIX  = documentOf('spec', [SPEC_FIVE, SPEC_SIX], [approvalOf(SPEC_FIVE), approvalOf(SPEC_SIX)]);
const SPEC_AWAITING_SIX     = documentOf('spec', [SPEC_FIVE, SPEC_SIX], [approvalOf(SPEC_FIVE)]);

/** A plan whose head version 2 the agent's proposal `P1`, written for spec `forSpecNumber`, made; its agent called it ready. */
function planWrittenFor(forSpecNumber: number): TicketDocument {
  return {
    ...documentOf('plan', [PLAN_TWO], [], 2),
    proposals: [{
      proposalId: 'P1', jobId: 'J4', baseNumber: 1, edits: [], summary: 'The plan.', forSpecNumber, state: 'applied', appliedNumber: 2, at: '2026-11-24T10:00:00.000Z'
    }],
  };
}

describe('standingOf', () => {
  test('a document with no version is unwritten', () => {
    expect(standingOf(documentOf('spec', []), undefined)).toBe('unwritten');
  });

  test('a document its agent has not called ready at the head is drafting', () => {
    expect(standingOf(documentOf('spec', [SPEC_FIVE], [], 4), undefined)).toBe('drafting');
  });

  test('a document its agent called ready at the head awaits review', () => {
    expect(standingOf(documentOf('spec', [SPEC_FIVE], [], 5), undefined)).toBe('awaiting-review');
  });

  test('a document approved at its head is approved', () => {
    expect(standingOf(documentOf('spec', [SPEC_FIVE], [approvalOf(SPEC_FIVE)]), undefined)).toBe('approved');
  });

  test('a document changed after its approval reads changed since approval, even when its agent called the new head ready', () => {
    expect(standingOf(documentOf('spec', [SPEC_FIVE, SPEC_SIX], [approvalOf(SPEC_FIVE)], 6), undefined)).toBe('changed-since-approval');
  });

  test('a plan approved on the spec\'s approved head is approved', () => {
    const plan = documentOf('plan', [PLAN_TWO], [approvalOf(PLAN_TWO, SPEC_FIVE)]);
    expect(standingOf(plan, SPEC_APPROVED_AT_FIVE)).toBe('approved');
  });

  test('a plan approved on an older spec version is out of date', () => {
    const plan = documentOf('plan', [PLAN_TWO], [approvalOf(PLAN_TWO, SPEC_FIVE)]);
    expect(standingOf(plan, SPEC_APPROVED_AT_SIX)).toBe('out-of-date');
  });

  test('a plan approved while the spec waits for its next approval is out of date', () => {
    const plan = documentOf('plan', [PLAN_TWO], [approvalOf(PLAN_TWO, SPEC_FIVE)]);
    expect(standingOf(plan, SPEC_AWAITING_SIX)).toBe('out-of-date');
  });

  test('the spec ignores the spec it is handed', () => {
    expect(standingOf(documentOf('spec', [SPEC_FIVE], [approvalOf(SPEC_FIVE)]), SPEC_AWAITING_SIX)).toBe('approved');
  });

  test('a plan not yet approved whose head the agent wrote for an older spec version is out of date', () => {
    expect(standingOf(planWrittenFor(5), SPEC_APPROVED_AT_SIX)).toBe('out-of-date');
  });

  test('a plan not yet approved whose head the agent wrote for the spec\'s approved head awaits review', () => {
    expect(standingOf(planWrittenFor(6), SPEC_APPROVED_AT_SIX)).toBe('awaiting-review');
  });

  test('a plan head a person wrote names no spec version, so it is not judged out of date', () => {
    expect(standingOf(documentOf('plan', [{ ...PLAN_TWO, author: 'person' }], [], 2), SPEC_APPROVED_AT_SIX)).toBe('awaiting-review');
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
