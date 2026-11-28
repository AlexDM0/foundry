import type { GroupWorktreeProblem } from '../../../shared/@types/GroupWorktreeProblem.ts';

/** Why a job's worktree was not made, as a code and its values; `gitMessage` is git's own text. The writer words it into the stored file. */
export type WorktreeCreationFailure =
  | GroupWorktreeProblem
  | { readonly code: 'group-name-not-portable'; readonly groupName: string }
  | { readonly code: 'worktree-add-refused'; readonly gitMessage: string }
  | { readonly code: 'git-did-not-run' };
