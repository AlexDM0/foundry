import type { BaseStoredFileProblem, StoredFileProblem } from '../../../shared/@types/StoredFileProblem.ts';

/** Why a field of a kept merged-tree gate does not hold the shape the gate run wrote. */
export type MergedTreeGateProblem =
  | StoredFileProblem<'gate-not-an-object'> & { readonly field: 'gate' }
  | StoredFileProblem<'not-a-gate-outcome'> & { readonly field: 'gate.outcome' }
  | StoredFileProblem<'neither-null-nor-a-step-name'> & { readonly field: 'gate.step' }
  | StoredFileProblem<'not-an-entity-key'> & { readonly field: 'gate.entity' }
  | StoredFileProblem<'output-not-text'> & { readonly field: 'gate.output' }
  | StoredFileProblem<'neither-null-nor-a-stamp'> & { readonly field: 'gate.stamp' }
  | StoredFileProblem<'not-a-hash-by-entity'> & { readonly field: 'gate.stamp.entityPhaseHashes' }
  | StoredFileProblem<'not-cache-reports'> & { readonly field: 'gate.cacheReports' }
  | StoredFileProblem<'not-step-runs'> & { readonly field: 'gate.stepRuns' };

/** Why a merged-tree gate run's `outcome.json` could not be read. */
export type MergedTreeGateOutcomeProblem = BaseStoredFileProblem | MergedTreeGateProblem;
