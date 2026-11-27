import type { BaseStoredFileProblem, StoredFileProblem } from '../../../shared/@types/StoredFileProblem.ts';

/** Why `airlock-facts.json` could not be read. */
export type AirlockFactsProblem =
  | BaseStoredFileProblem
  | StoredFileProblem<'not-a-list-of-file-paths'> & { readonly field: 'conflictedFiles' | 'filesResolvedBefore' }
  | StoredFileProblem<'neither-true-nor-false'> & { readonly field: 'leavesTheMergeOpen' };
