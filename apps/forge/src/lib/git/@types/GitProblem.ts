/** Why a git step did not succeed, as a code and its values: what forge ran and git's own message as a fact; `src/adapters/` words it. */
export type GitRunFailure =
  | { readonly code: 'git-not-started'; readonly gitArguments: readonly string[] }
  | { readonly code: 'git-exited'; readonly gitArguments: readonly string[]; readonly exitCode: number; readonly gitMessage: string };

/** A command git ran and reported done, after which HEAD is not the commit it should be; `commandArguments` as the sentence names it. */
export interface HeadDiffersProblem {
  readonly code:             'head-differs-after-success';
  readonly commandArguments: readonly string[];
  readonly headCommit:       string | null;
}

export type MergePredictionProblem =
  | GitRunFailure
  | { readonly code: 'git-exited-without-tree'; readonly gitArguments: readonly string[]; readonly exitCode: number; readonly gitMessage: string }
  | { readonly code: 'batch-record-without-tree'; readonly recordStatus: string }
  | { readonly code: 'batch-record-status-unknown'; readonly recordStatus: string }
  | { readonly code: 'batch-records-miscounted'; readonly pairCount: number };

export type WorktreeStepProblem =
  | GitRunFailure
  | { readonly code: 'index-lock-not-removed'; readonly lockPath: string; readonly systemError: string }
  | { readonly code: 'untracked-file-not-saved'; readonly untrackedFile: string }
  | { readonly code: 'patch-not-written'; readonly patchPath: string; readonly systemError: string };

export type WorktreeRemovalProblem =
  | GitRunFailure
  | { readonly code: 'worktree-folder-not-deleted'; readonly worktreePath: string; readonly gitFailure: GitRunFailure };

export type GitProblem = MergePredictionProblem | WorktreeStepProblem | WorktreeRemovalProblem | HeadDiffersProblem;
