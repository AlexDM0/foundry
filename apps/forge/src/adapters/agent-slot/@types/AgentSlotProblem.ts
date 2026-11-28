import type { BaseStoredFileProblem, StoredFileProblem } from '../../../shared/@types/StoredFileProblem.ts';

/** Why an agent slot `slot-<n>` could not be read. */
export type AgentSlotProblem =
  | BaseStoredFileProblem
  | StoredFileProblem<'field-not-a-string'> & { readonly field: 'trackerId' | 'jobId' }
  | StoredFileProblem<'field-not-a-process-identity'> & { readonly field: 'hephaestus' };
