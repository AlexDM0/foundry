import type { BaseStoredFileProblem, StoredFileProblem } from '../../../shared/@types/StoredFileProblem.ts';

export type HeartbeatField = 'generation' | 'sequence' | 'at';

/** Why `heartbeat.json` could not be read. */
export type HeartbeatProblem =
  | BaseStoredFileProblem
  | StoredFileProblem<'heartbeat-field-malformed'> & { readonly field: HeartbeatField };
