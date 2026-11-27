/** The checks that the ticket stayed as the job's start found it (V6, V18): its content hash and its documents' heads. */
import type { CustomsSubject } from './@types/CustomsSubject.ts';
import type { CheckVerdict }   from './@types/CustomsVerdict.ts';
import { PASSED, refused }     from './CustomsReadings.ts';

export function ticketContentUnchanged(subject: CustomsSubject): CheckVerdict {
  const { contentHashAtLaunch, ticketContentHash } = subject;
  return ticketContentHash === contentHashAtLaunch ? PASSED : refused('ticket-content-changed', [contentHashAtLaunch, ticketContentHash]);
}

export function ticketDocumentsUnchanged(subject: CustomsSubject): CheckVerdict {
  const atLaunch = subject.documentVersionsAtLaunch ?? '';
  const atEnd    = subject.ticketDocumentVersions ?? '';
  return atLaunch === atEnd ? PASSED : refused('ticket-documents-changed', [atLaunch, atEnd]);
}
