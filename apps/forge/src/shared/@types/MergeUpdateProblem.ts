import type { GitRunFailure, HeadDiffersProblem } from '../../lib/git/@types/GitProblem.ts';

/** Why the merge of a target into a ticket's worktree failed, as a code and its values; `src/adapters/` words it. */
export type MergeUpdateProblem =
  | GitRunFailure
  | HeadDiffersProblem
  | { readonly code: 'worktree-head-unreadable'; readonly worktree: string }
  | { readonly code: 'target-unresolved' }
  | { readonly code: 'unknown-commit' };
