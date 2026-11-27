import type { BaseStoredFileProblem, StoredFileProblem } from '../../../shared/@types/StoredFileProblem.ts';

export type PresenceMalformedField =
  'generation' | 'process' | 'codeVersion' | 'startOrigin' | 'startedAt' | 'startClassification' | 'abandonedPasses' | 'ending';

/** Why `presence.json` could not be read. */
export type PresenceProblem =
  | BaseStoredFileProblem
  | StoredFileProblem<'presence-field-malformed'> & { readonly field: PresenceMalformedField };
