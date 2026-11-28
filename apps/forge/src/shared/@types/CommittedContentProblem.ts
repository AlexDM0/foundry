import type { BaseStoredFileProblem, StoredFileProblem } from './StoredFileProblem.ts';

/** Why a committed ticket's kept content, `<hash>.json`, could not be read. */
export type CommittedContentProblem =
  | BaseStoredFileProblem
  | StoredFileProblem<'no-content-under-the-hash'> & { readonly contentHash: string }
  | StoredFileProblem<'not-a-title-and-body'>
  | StoredFileProblem<'title-and-body-hash-differs'> & { readonly contentHash: string };
