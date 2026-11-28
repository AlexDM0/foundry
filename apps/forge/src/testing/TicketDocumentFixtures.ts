/**
 * Ticket document records and document agent jobs built by hand, for the specs of Hephaestus's document sessions, which run before the
 * Board's own document moves write them. Every version names its text by content hash, as the store loads it.
 */
import type { Job }    from '../domain/tracker-model/@types/Job.ts';
import type {
  DocumentApproval,
  DocumentMessage,
  DocumentProposal,
  LoadedTicketDocumentRecord,
  TicketDocument,
  TicketDocumentKind
} from '../domain/tracker-model/@types/TicketDocument.ts';
import { DocumentAgentJobUtil }      from '../domain/tracker-model/utils/DocumentAgentJobUtil.ts';
import { TicketDocumentVersionUtil } from '../domain/tracker-model/utils/TicketDocumentVersionUtil.ts';

export const DOCUMENT_FIXTURE_AT = '2026-11-24T10:00:00.000Z';

export const SNAPSHOT_COMMIT_FIXTURE = 'c0ffee0123456789abcdef0123456789abcdef01';

/** A document as the fixture writes it: its version texts in order, and the parts of its record a case sets. */
export interface DocumentFixture {
  kind:           TicketDocumentKind;
  texts?:         readonly string[];
  approvals?:     readonly { number: number; by?: DocumentApproval['by']; onSpecText?: string }[];
  messages?:      readonly DocumentMessage[];
  proposals?:     readonly DocumentProposal[];
  readyAtNumber?: number;
}

function documentOf(fixture: DocumentFixture): TicketDocument {
  const texts = fixture.texts ?? [];
  const hashOfNumber = (versionNumber: number): string => TicketDocumentVersionUtil.contentHashOf(texts[versionNumber - 1] ?? '');
  return {
    kind:     fixture.kind,
    versions: texts.map((text, index) => ({
      number: index + 1, contentHash: TicketDocumentVersionUtil.contentHashOf(text), author: 'agent', jobId: 'J4', at: DOCUMENT_FIXTURE_AT
    })),
    approvals: (fixture.approvals ?? []).map((approval) => ({
      number:             approval.number,
      contentHash:        hashOfNumber(approval.number),
      by:                 approval.by ?? 'person',
      at:                 DOCUMENT_FIXTURE_AT,
      constitutionCommit: SNAPSHOT_COMMIT_FIXTURE,
      ...(approval.onSpecText === undefined ? {} : { onSpecNumber: 1, onSpecContentHash: TicketDocumentVersionUtil.contentHashOf(approval.onSpecText) }),
    })),
    messages:           [...(fixture.messages ?? [])],
    proposals:          [...(fixture.proposals ?? [])],
    proposalMode:       'ask-first',
    ...(fixture.readyAtNumber === undefined ? {} : { readyAtNumber: fixture.readyAtNumber }),
    nextMessageNumber:  (fixture.messages?.length ?? 0) + 1,
    nextCommentNumber:  1,
    nextProposalNumber: (fixture.proposals?.length ?? 0) + 1,
  };
}

export function ticketDocumentRecordFixture(ticketId: string, documents: readonly DocumentFixture[]): LoadedTicketDocumentRecord {
  const texts = documents.flatMap((document) => document.texts ?? []);
  return {
    record: {
      version: 1, ticketId, openedAt: DOCUMENT_FIXTURE_AT, documents: documents.map(documentOf)
    },
    textOfContentHash: Object.fromEntries(texts.map((text) => [TicketDocumentVersionUtil.contentHashOf(text), text])),
  };
}

export function documentMessageFixture(messageId: string, overrides: Partial<DocumentMessage> = {}): DocumentMessage {
  return {
    messageId, text: `Example comment ${messageId}`, from: 'person', state: 'queued', queuedAt: DOCUMENT_FIXTURE_AT, ...overrides
  };
}

export function documentAgentJobFixture(ticketId: string, document: TicketDocumentKind, overrides: Partial<Job> = {}): Job {
  return {
    id:                 'J9',
    kind:               'document-agent',
    role:               DocumentAgentJobUtil.roleOf(document),
    ticketIds:          [ticketId],
    parentJobId:        null,
    attempt:            1,
    target:             null,
    state:              'running',
    childInstance:      1,
    eventCursor:        { instance: 1, sequence: 0 },
    answeredRequestIds: [],
    crashResumes:       0,
    ...overrides,
  };
}
