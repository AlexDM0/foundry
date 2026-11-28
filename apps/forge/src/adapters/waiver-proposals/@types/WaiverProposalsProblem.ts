import type { BaseStoredFileProblem, StoredFileProblem } from '../../../shared/@types/StoredFileProblem.ts';

/** Why a review's waiver proposals could not be read; `field` of a malformed proposal is its path (`proposals[1]`). */
export type WaiverProposalsProblem =
  | BaseStoredFileProblem
  | StoredFileProblem<'not-a-list-of-proposals'> & { readonly field: 'proposals' }
  | StoredFileProblem<'proposal-without-text-item-and-reason'> & { readonly field: string };
