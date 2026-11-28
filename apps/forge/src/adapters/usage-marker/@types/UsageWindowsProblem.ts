import type { BaseStoredFileProblem, StoredFileProblem } from '../../../shared/@types/StoredFileProblem.ts';

/** Why `usage-windows.json` could not be read; `window` is the window's name as stored. */
export type UsageWindowsProblem =
  | BaseStoredFileProblem
  | StoredFileProblem<'windows-not-an-object'> & { readonly field: 'windows' }
  | StoredFileProblem<'window-with-no-name'>
  | StoredFileProblem<'window-not-an-object'> & { readonly window: string }
  | StoredFileProblem<'window-length-hours-not-a-number-or-null'> & { readonly window: string }
  | StoredFileProblem<'window-utilization-not-a-number'> & { readonly window: string }
  | StoredFileProblem<'window-resets-at-not-a-stamp'> & { readonly window: string };
