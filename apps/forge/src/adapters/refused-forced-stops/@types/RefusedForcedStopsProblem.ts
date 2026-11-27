import type { BaseStoredFileProblem, StoredFileProblem } from '../../../shared/@types/StoredFileProblem.ts';

/** Why a `child-<instance>.refused-forced-stops` file could not be read. */
export type RefusedForcedStopsProblem =
  | BaseStoredFileProblem
  | StoredFileProblem<'refused-forced-stops-field-malformed'> & { readonly field: 'refusals' | 'treeProcessIds' };
