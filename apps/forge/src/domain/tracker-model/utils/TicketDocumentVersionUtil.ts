/**
 * The versions of a ticket document: a version is known by the content hash of its text, its number is for display, and the head is the
 * newest. An approval stands at the head when it approved the head's text, whichever version number it named.
 */
import type { DocumentApproval, DocumentVersion, TicketDocument } from '../@types/TicketDocument.ts';
import { TicketBodyHashUtil }                                     from './TicketBodyHashUtil.ts';

function contentHashOf(text: string): string {
  return TicketBodyHashUtil.bodyHashOf(text);
}

function headOf(document: Readonly<TicketDocument>): Readonly<DocumentVersion> | null {
  return document.versions.at(-1) ?? null;
}

function versionOfNumber(document: Readonly<TicketDocument>, versionNumber: number): Readonly<DocumentVersion> | null {
  return document.versions.find((version) => version.number === versionNumber) ?? null;
}

/** The number the next version takes: one more than the head's, or 1 for the first. */
function nextVersionNumberOf(document: Readonly<TicketDocument>): number {
  return (headOf(document)?.number ?? 0) + 1;
}

/** The newest approval of the head's text; `null` without a head or while no approval holds that text. */
function approvalAtHeadOf(document: Readonly<TicketDocument>): Readonly<DocumentApproval> | null {
  const head = headOf(document);
  if (head === null) return null;
  return document.approvals.findLast((approval) => approval.contentHash === head.contentHash) ?? null;
}

/**
 * The head's number while an approval stands at the head: the spec version a plan is written for. Not the approval's own number, which
 * names the version first approved with that text and stays old when the text comes back.
 */
function approvedHeadNumberOf(document: Readonly<TicketDocument>): number | null {
  return approvalAtHeadOf(document) === null ? null : headOf(document)?.number ?? null;
}

/** The head's content hash while an approval stands at the head; what a plan's approval must have been made on. */
function approvedHeadHashOf(document: Readonly<TicketDocument>): string | null {
  return approvalAtHeadOf(document) === null ? null : headOf(document)?.contentHash ?? null;
}

export const TicketDocumentVersionUtil = Object.freeze({
  contentHashOf,
  headOf,
  versionOfNumber,
  nextVersionNumberOf,
  approvalAtHeadOf,
  approvedHeadNumberOf,
  approvedHeadHashOf,
});
