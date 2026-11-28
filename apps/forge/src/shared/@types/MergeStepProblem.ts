/**
 * Why a review's target catch-up or a job's main merge cannot go on: git cannot read a tip or a tree, or cannot tell whether the branch holds
 * the target's tip, or the merge settled failed, whose stored reason is the settlement file's own text.
 */
export type MergeStepProblem =
  | { readonly code: 'tip-unreadable'; readonly branch: string }
  | { readonly code: 'holding-unknown'; readonly branch: string; readonly target: string; readonly targetTip: string }
  | { readonly code: 'merge-tree-unreadable'; readonly mergeCommit: string }
  | { readonly code: 'head-tree-unreadable'; readonly branch: string }
  | { readonly code: 'merge-settled-failed'; readonly storedReason: string };
