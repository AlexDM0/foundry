/**
 * The versions of a ticket document. What matters: a version's identity is the FNV-1a hash of its text, the hash a ticket body takes; the
 * head is the newest version; numbering goes on from the head; and an approval stands at the head by the text it approved, so text
 * brought back to an approved version reads approved again, while a newer text leaves no approval at the head.
 */
import { describe, expect, test } from 'bun:test';

import type { DocumentApproval, DocumentVersion, TicketDocument } from '../@types/TicketDocument.ts';
import { TicketBodyHashUtil }                                     from './TicketBodyHashUtil.ts';
import { TicketDocumentVersionUtil }                              from './TicketDocumentVersionUtil.ts';

const {
  approvalAtHeadOf, approvedHeadHashOf, contentHashOf, headOf, nextVersionNumberOf, versionOfNumber
} = TicketDocumentVersionUtil;

function versionOf(versionNumber: number, text: string): DocumentVersion {
  return {
    number: versionNumber, contentHash: contentHashOf(text), author: 'person', at: '2026-11-24T10:00:00.000Z'
  };
}

function approvalOf(version: Readonly<DocumentVersion>): DocumentApproval {
  return {
    number: version.number, contentHash: version.contentHash, by: 'person', at: '2026-11-24T11:00:00.000Z', constitutionCommit: 'abc1234'
  };
}

function specWith(versions: DocumentVersion[], approvals: DocumentApproval[] = []): TicketDocument {
  return {
    kind:               'spec',
    versions,
    approvals,
    messages:           [],
    proposals:          [],
    proposalMode:       'ask-first',
    nextMessageNumber:  1,
    nextCommentNumber:  1,
    nextProposalNumber: 1,
  };
}

const FIRST  = versionOf(1, '# Example spec\n');
const SECOND = versionOf(2, '# Example spec\n\nAlex Example opens the basket.\n');

describe('the versions of a ticket document', () => {
  test('a content hash is the FNV-1a hash a ticket body takes', () => {
    expect(contentHashOf('# Example spec\n')).toBe(TicketBodyHashUtil.bodyHashOf('# Example spec\n'));
    expect(contentHashOf('a')).toBe('af63dc4c8601ec8c');
  });

  test('a document with no version has no head and numbers its first version 1', () => {
    expect(headOf(specWith([]))).toBeNull();
    expect(nextVersionNumberOf(specWith([]))).toBe(1);
  });

  test('the head is the newest version, and numbering goes on from it', () => {
    const spec = specWith([FIRST, SECOND]);
    expect(headOf(spec)).toEqual(SECOND);
    expect(nextVersionNumberOf(spec)).toBe(3);
    expect(versionOfNumber(spec, 1)).toEqual(FIRST);
    expect(versionOfNumber(spec, 7)).toBeNull();
  });

  test('an approval of the head\'s text stands at the head', () => {
    const spec = specWith([FIRST, SECOND], [approvalOf(SECOND)]);
    expect(approvalAtHeadOf(spec)).toEqual(approvalOf(SECOND));
    expect(approvedHeadHashOf(spec)).toBe(SECOND.contentHash);
  });

  test('a newer version leaves no approval at the head', () => {
    const spec = specWith([FIRST, SECOND], [approvalOf(FIRST)]);
    expect(approvalAtHeadOf(spec)).toBeNull();
    expect(approvedHeadHashOf(spec)).toBeNull();
  });

  test('text brought back to an approved version reads approved again, by its hash', () => {
    const third = versionOf(3, '# Example spec\n');
    const spec  = specWith([FIRST, SECOND, third], [approvalOf(FIRST)]);
    expect(approvalAtHeadOf(spec)).toEqual(approvalOf(FIRST));
  });
});
