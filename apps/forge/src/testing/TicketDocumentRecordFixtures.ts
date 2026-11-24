/** A ticket's documents record built from its version texts and approvals, its hashes and its texts filled in, for the specs that read one. */
import type {
  DocumentApprover,
  LoadedTicketDocumentRecord,
  TicketDocument,
  TicketDocumentKind
} from '../lib/tracker-model/@types/TicketDocument.ts';
import { TicketDocumentVersionUtil } from '../lib/tracker-model/utils/TicketDocumentVersionUtil.ts';

const FIXTURE_AT = '2026-11-24T10:00:00.000Z';

export interface ApprovalFixture {
  number:        number;
  by:            DocumentApprover;
  /** A plan's approval: the spec version it was made on. */
  onSpecNumber?: number;
}

export interface DocumentFixture {
  /** Each version's text, version 1 first. */
  texts:      readonly string[];
  approvals?: readonly ApprovalFixture[];
}

function documentFixtureOf(kind: TicketDocumentKind, fixture: DocumentFixture, specTexts: readonly string[]): TicketDocument {
  const hashOfNumber = (texts: readonly string[], versionNumber: number): string => TicketDocumentVersionUtil.contentHashOf(texts[versionNumber - 1] ?? '');
  return {
    kind,
    versions: fixture.texts.map((text, index) => ({
      number: index + 1, contentHash: TicketDocumentVersionUtil.contentHashOf(text), author: 'agent', jobId: 'J4', at: FIXTURE_AT
    })),
    approvals: (fixture.approvals ?? []).map((approval) => ({
      number:             approval.number,
      contentHash:        hashOfNumber(fixture.texts, approval.number),
      by:                 approval.by,
      at:                 FIXTURE_AT,
      constitutionCommit: 'c1',
      ...(approval.onSpecNumber === undefined ? {} : { onSpecNumber: approval.onSpecNumber, onSpecContentHash: hashOfNumber(specTexts, approval.onSpecNumber) }),
    })),
    messages:           [],
    proposals:          [],
    proposalMode:       'ask-first',
    nextMessageNumber:  1,
    nextCommentNumber:  1,
    nextProposalNumber: 1,
  };
}

export function loadedRecordFixture(ticketId: string, documents: Partial<Record<TicketDocumentKind, DocumentFixture>>): LoadedTicketDocumentRecord {
  const specTexts = documents.spec?.texts ?? [];
  const kinds = (['spec', 'plan'] as const).filter((kind) => documents[kind] !== undefined);
  const allTexts = kinds.flatMap((kind) => documents[kind]?.texts ?? []);
  return {
    record: {
      version:   1,
      ticketId,
      openedAt:  FIXTURE_AT,
      documents: kinds.map((kind) => documentFixtureOf(kind, documents[kind] ?? { texts: [] }, specTexts)),
    },
    textOfContentHash: Object.fromEntries(allTexts.map((text) => [TicketDocumentVersionUtil.contentHashOf(text), text])),
  };
}
