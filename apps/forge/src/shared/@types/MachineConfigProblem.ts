import type { BaseStoredFileProblem, StoredFileProblem } from './StoredFileProblem.ts';

/** Why this machine's `config.json` could not be read; an `OperationRefusal` detail carries it, so it lives in `src/shared/`. */
export type MachineConfigProblem =
  | BaseStoredFileProblem
  | StoredFileProblem<'version-not-a-whole-number'> & { readonly field: 'version' }
  | StoredFileProblem<'version-older'> & { readonly field: 'version'; readonly version: number; readonly readableVersion: number }
  | StoredFileProblem<'agents-not-an-object'> & { readonly field: 'agents' }
  | StoredFileProblem<'agent-names-no-program-path'> & { readonly field: string; readonly vendor: string };

/** Why this machine's config was not written over: a file this build cannot read, or one of a newer version than it reads. */
export type MachineConfigUnwritableProblem =
  | MachineConfigProblem
  | StoredFileProblem<'version-newer'> & { readonly field: 'version'; readonly version: number };
