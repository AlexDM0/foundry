/**
 * Where a ticket document stands, judged on content hashes alone. A plan is out of date when the spec version it was approved on, or, with
 * no approval at its head, the one the agent's proposal that made its head was written for, is not the spec's approved head.
 */
import type {
  DocumentStanding,
  TicketDocument,
  TicketDocumentKind,
  TicketDocumentRecord
} from '../@types/TicketDocument.ts';
import { TICKET_DOCUMENT_KINDS }     from '../@types/TicketDocument.ts';
import { TicketDocumentVersionUtil } from './TicketDocumentVersionUtil.ts';

/** A spec version as a plan names it: its number for display, its content hash for the judgement. */
export interface SpecVersionOfPlan {
  number:      number;
  contentHash: string;
}

/**
 * The spec version the plan's head was approved on; with no approval at the head, the one the proposal that made the head was written for.
 * `null` when neither says: a head User wrote, or a plan with no version.
 */
function specVersionOfPlanHeadOf(plan: Readonly<TicketDocument>, spec: Readonly<TicketDocument> | undefined): SpecVersionOfPlan | null {
  const approvalAtHead = TicketDocumentVersionUtil.approvalAtHeadOf(plan);
  if (approvalAtHead !== null) {
    const { onSpecNumber, onSpecContentHash } = approvalAtHead;
    return onSpecNumber === undefined || onSpecContentHash === undefined ? null : { number: onSpecNumber, contentHash: onSpecContentHash };
  }
  const head        = TicketDocumentVersionUtil.headOf(plan);
  const madeTheHead = head === null ? undefined : plan.proposals.find((proposal) => proposal.state === 'applied' && proposal.appliedNumber === head.number);
  const writtenFor  = madeTheHead?.forSpecNumber;
  const specVersion = writtenFor === undefined || spec === undefined ? null : TicketDocumentVersionUtil.versionOfNumber(spec, writtenFor);
  return specVersion === null ? null : { number: specVersion.number, contentHash: specVersion.contentHash };
}

function standingOf(document: Readonly<TicketDocument>, spec: Readonly<TicketDocument> | undefined): DocumentStanding {
  const head = TicketDocumentVersionUtil.headOf(document);
  if (head === null) return 'unwritten';
  const approvalAtHead = TicketDocumentVersionUtil.approvalAtHeadOf(document);
  if (document.kind === 'plan') {
    const approvedSpecHeadHash = spec === undefined ? null : TicketDocumentVersionUtil.approvedHeadHashOf(spec);
    const specVersion          = specVersionOfPlanHeadOf(document, spec);
    if (approvalAtHead !== null) return specVersion?.contentHash === approvedSpecHeadHash ? 'approved' : 'out-of-date';
    if (specVersion !== null && approvedSpecHeadHash !== null && specVersion.contentHash !== approvedSpecHeadHash) return 'out-of-date';
  } else if (approvalAtHead !== null) {
    return 'approved';
  }
  if (document.approvals.length > 0) return 'changed-since-approval';
  return document.readyAtNumber === head.number ? 'awaiting-review' : 'drafting';
}

/** Each document of the record's standing; a document the record does not hold is `unwritten`. */
function standingsOf(record: Readonly<TicketDocumentRecord>): Record<TicketDocumentKind, DocumentStanding> {
  const documentOfKind = (kind: TicketDocumentKind): Readonly<TicketDocument> | undefined => record.documents.find((document) => document.kind === kind);
  const spec           = documentOfKind('spec');
  const standingOfKind = (kind: TicketDocumentKind): DocumentStanding => {
    const document = documentOfKind(kind);
    return document === undefined ? 'unwritten' : standingOf(document, spec);
  };
  return Object.fromEntries(TICKET_DOCUMENT_KINDS.map((kind) => [kind, standingOfKind(kind)])) as Record<TicketDocumentKind, DocumentStanding>;
}

export const TicketDocumentStandingUtil = Object.freeze({ standingOf, standingsOf, specVersionOfPlanHeadOf });
