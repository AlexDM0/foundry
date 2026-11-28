import type { GitRunFailure } from '../../lib/git/@types/GitProblem.ts';

/** Why git could not read or commit an Apply's constitutions; `src/adapters/ConstitutionCommitProblemWording.ts` words it. */
export type ConstitutionCommitProblem =
  | GitRunFailure
  | { readonly code: 'commit-not-made'; readonly gitArguments: readonly string[] };
