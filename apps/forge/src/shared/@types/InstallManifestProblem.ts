import type { BaseStoredFileProblem, StoredFileProblem } from './StoredFileProblem.ts';

/**
 * Why `.agent-progress/version.json` gives no install version; an install-version mismatch carries it, so it lives in `src/shared/`.
 * `storedValue` is the value as JSON wrote it, `null` when the key is missing.
 */
export type InstallManifestProblem =
  | BaseStoredFileProblem
  | StoredFileProblem<'install-version-not-a-whole-number'> & {
    readonly field:                'installVersion';
    readonly storedValue:          string | null;
    readonly lowestInstallVersion: number;
  };
