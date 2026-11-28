import type { BaseStoredFileProblem, StoredFileProblem } from '../../../shared/@types/StoredFileProblem.ts';

/** Why `document-agent-seen-head.json` could not be read. */
export type SeenHeadProblem =
  | BaseStoredFileProblem
  | StoredFileProblem<'not-text-or-null'> & { readonly field: 'contentHash' };
