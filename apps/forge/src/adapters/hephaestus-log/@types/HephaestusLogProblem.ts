import type { BaseStoredFileProblem, StoredFileProblem } from '../../../shared/@types/StoredFileProblem.ts';

/** Why `hephaestus.log`, or one of its lines, could not be read as a log record. */
export type HephaestusLogProblem =
  | BaseStoredFileProblem
  | StoredFileProblem<'field-not-a-string'> & { readonly field: 'at' | 'kind' | 'details' };
