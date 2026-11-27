import type { BaseStoredFileProblem, StoredFileProblem } from '../../../shared/@types/StoredFileProblem.ts';

/** Why a Hephaestus lock `lock-<generation>.json` could not be read. */
export type HephaestusLockProblem =
  | BaseStoredFileProblem
  | StoredFileProblem<'field-not-a-number'> & { readonly field: string }
  | StoredFileProblem<'field-not-a-string'> & { readonly field: string };
