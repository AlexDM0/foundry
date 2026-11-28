import type { BaseStoredFileProblem, StoredFileProblem } from '../../../shared/@types/StoredFileProblem.ts';

/** Why one version of a ticket document, `<contentHash>.md`, could not be read. */
export type TicketDocumentContentProblem =
  | BaseStoredFileProblem
  | StoredFileProblem<'no-text-under-the-hash'> & { readonly contentHash: string }
  | StoredFileProblem<'text-hash-differs'> & { readonly contentHash: string };
