import type { BaseStoredFileProblem, StoredFileProblem } from '../../../shared/@types/StoredFileProblem.ts';

/** Why a job's `launch-settings.json` could not be read. */
export type LaunchSettingsProblem =
  | BaseStoredFileProblem
  | StoredFileProblem<'launch-setting-not-text'> & { readonly field: 'model' | 'effort' };
