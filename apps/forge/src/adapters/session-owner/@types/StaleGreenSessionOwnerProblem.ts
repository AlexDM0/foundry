import type { BaseStoredFileProblem, StoredFileProblem } from '../../../shared/@types/StoredFileProblem.ts';

/** Why the recorded session owner of a stale green could not be read. */
export type StaleGreenSessionOwnerProblem =
  | BaseStoredFileProblem
  | StoredFileProblem<'neither-a-job-id-nor-null'> & { readonly field: 'sessionOwnerJobId' };
