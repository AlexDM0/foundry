import type { BaseStoredFileProblem, StoredFileProblem } from '../../../shared/@types/StoredFileProblem.ts';

/** Why `usage-limit.json` could not be read. */
export type UsageMarkerProblem =
  | BaseStoredFileProblem
  | StoredFileProblem<'vendor-or-window-not-text'>
  | StoredFileProblem<'resets-at-not-a-stamp'> & { readonly field: 'resetsAt' }
  | StoredFileProblem<'seen-by-not-an-object'> & { readonly field: 'seenBy' }
  | StoredFileProblem<'seen-by-names-no-job'> & { readonly field: 'seenBy' };
