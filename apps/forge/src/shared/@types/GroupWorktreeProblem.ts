import type { GitRunFailure } from '../../lib/git/@types/GitProblem.ts';

/** Why a group's worktree or its refresh worktree could not be made ready, as a code and the paths it names; `src/adapters/` words it. */
export type GroupWorktreeProblem =
  | GitRunFailure
  | { readonly code: 'leftover-not-a-checkout'; readonly path: string }
  | { readonly code: 'checkout-of-another-branch'; readonly path: string; readonly expectedBranch: string }
  | { readonly code: 'refresh-merge-in-progress'; readonly path: string }
  | { readonly code: 'refresh-changes-uncommitted'; readonly path: string }
  | { readonly code: 'refresh-not-detached'; readonly path: string; readonly gitFailure: GitRunFailure };
