import type { BaseStoredFileProblem, StoredFileProblem } from '../../../shared/@types/StoredFileProblem.ts';

/** Why a lock folder's `generation-<n>` record could not be read. */
export type GenerationRecordProblem =
  | BaseStoredFileProblem
  | StoredFileProblem<'field-not-a-process-identity'> & { readonly field: 'holder' }
  | StoredFileProblem<'field-not-a-string'> & { readonly field: 'acquiredAt' }
  | StoredFileProblem<'state-not-a-generation-state'> & { readonly field: 'state' };

/** A read of the record's bytes that failed now, which says nothing of its shape. */
export type GenerationRecordBytesProblem = Extract<BaseStoredFileProblem, { code: 'bytes-unreadable' }>;
