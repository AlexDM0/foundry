import type { TipRestoreOutcome } from '../../../lib/git/BranchMerge.ts';

/** Why a merge into a ticket's worktree settled as failed, as a code and the commits it names; the settlement writer words it. */
export type MergeFailure =
  | { readonly code: 'git-not-found' }
  | { readonly code: 'conflicted-merge-not-undone'; readonly mergedTip: string; readonly restoreVerdict: Exclude<TipRestoreOutcome['verdict'], 'restored'> }
  | { readonly code: 'stopped-without-conflicted-file'; readonly mergedTip: string }
  | { readonly code: 'merge-not-committed'; readonly mergedTip: string; readonly headCommit: string | null };
