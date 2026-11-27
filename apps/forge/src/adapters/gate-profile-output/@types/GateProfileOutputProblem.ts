import type { BaseStoredFileProblem, StoredFileProblem } from '../../../shared/@types/StoredFileProblem.ts';

/** Why a gate profile's output file, or one of its lines, could not be read. */
export type GateProfileOutputProblem =
  | BaseStoredFileProblem
  | StoredFileProblem<'text-not-a-string'> & { readonly field: 'text' };
