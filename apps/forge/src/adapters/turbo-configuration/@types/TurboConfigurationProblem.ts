import type { BaseStoredFileProblem, StoredFileProblem } from '../../../shared/@types/StoredFileProblem.ts';

/** Why a repository's `turbo.json` could not be read; `task` is the task's name as stored. */
export type TurboConfigurationProblem =
  | BaseStoredFileProblem
  | StoredFileProblem<'cache-dir-not-a-string'> & { readonly field: 'cacheDir' }
  | StoredFileProblem<'tasks-not-an-object'> & { readonly field: 'tasks' | 'pipeline' }
  | StoredFileProblem<'task-not-an-object'> & { readonly task: string }
  | StoredFileProblem<'task-inputs-not-a-list-of-strings'> & { readonly task: string };
