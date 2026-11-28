import type { BaseStoredFileProblem, StoredFileProblem } from './StoredFileProblem.ts';

/** Why `hold-journal.json` could not be trusted whole; `field` is the stored path, such as `files[2].path`. */
export type HoldJournalProblem =
  | BaseStoredFileProblem
  | StoredFileProblem<'files-not-a-list'> & { readonly field: 'files' }
  | StoredFileProblem<'entry-not-an-object'> & { readonly field: string }
  | StoredFileProblem<'entry-path-outside-the-data-folder'> & { readonly field: string }
  | StoredFileProblem<'entry-neither-contents-nor-removed'> & { readonly field: string };
