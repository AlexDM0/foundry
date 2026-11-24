/**
 * Where a ticket document stands, judged on content hashes alone. A plan approved at its head is out of date unless it was approved on the
 * spec's approved head: the spec's head while an approval stands there.
 */
import type {
  DocumentStanding,
  TicketDocument,
  TicketDocumentKind,
  TicketDocumentRecord
} from '../@types/TicketDocument.ts';
import { TICKET_DOCUMENT_KINDS }     from '../@types/TicketDocument.ts';
import { TicketDocumentVersionUtil } from './TicketDocumentVersionUtil.ts';

/** `approvedSpecHeadHash` is read only for a plan: `TicketDocumentVersionUtil.approvedHeadHashOf` of the spec, `null` while it has none. */
function standingOf(document: Readonly<TicketDocument>, approvedSpecHeadHash: string | null): DocumentStanding {
  const head = TicketDocumentVersionUtil.headOf(document);
  if (head === null) return 'unwritten';
  const approvalAtHead = TicketDocumentVersionUtil.approvalAtHeadOf(document);
  if (approvalAtHead !== null) {
    const approvedOnTheSpecItReads = document.kind !== 'plan' || approvalAtHead.onSpecContentHash === approvedSpecHeadHash;
    return approvedOnTheSpecItReads ? 'approved' : 'out-of-date';
  }
  if (document.approvals.length > 0) return 'changed-since-approval';
  return document.readyAtNumber === head.number ? 'awaiting-review' : 'drafting';
}

/** Each document of the record's standing; a document the record does not hold is `unwritten`. */
function standingsOf(record: Readonly<TicketDocumentRecord>): Record<TicketDocumentKind, DocumentStanding> {
  const documentOfKind       = (kind: TicketDocumentKind): Readonly<TicketDocument> | undefined => record.documents.find((document) => document.kind === kind);
  const spec                 = documentOfKind('spec');
  const approvedSpecHeadHash = spec === undefined ? null : TicketDocumentVersionUtil.approvedHeadHashOf(spec);
  const standingOfKind       = (kind: TicketDocumentKind): DocumentStanding => {
    const document = documentOfKind(kind);
    return document === undefined ? 'unwritten' : standingOf(document, approvedSpecHeadHash);
  };
  return Object.fromEntries(TICKET_DOCUMENT_KINDS.map((kind) => [kind, standingOfKind(kind)])) as Record<TicketDocumentKind, DocumentStanding>;
}

export const TicketDocumentStandingUtil = Object.freeze({ standingOf, standingsOf });
