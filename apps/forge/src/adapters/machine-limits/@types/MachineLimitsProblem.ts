import type { BaseStoredFileProblem, StoredFileProblem } from '../../../shared/@types/StoredFileProblem.ts';

/** Why `machine-limits.json` could not be read. */
export type MachineLimitsProblem =
  | BaseStoredFileProblem
  | StoredFileProblem<'version-not-a-whole-number'> & { readonly field: 'version' }
  | StoredFileProblem<'version-older'> & { readonly field: 'version'; readonly version: number; readonly readableVersion: number }
  | StoredFileProblem<'agent-limit-below-one'> & { readonly field: 'agentLimit' };
