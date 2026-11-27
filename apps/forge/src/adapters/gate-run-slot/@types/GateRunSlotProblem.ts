import type { BaseStoredFileProblem, StoredFileProblem } from '../../../shared/@types/StoredFileProblem.ts';

/** Why a gate run slot `slot-<n>` could not be read. */
export type GateRunSlotProblem =
  | BaseStoredFileProblem
  | StoredFileProblem<'names-no-holder'>
  | StoredFileProblem<'field-not-a-process-identity'> & { readonly field: 'process' };
