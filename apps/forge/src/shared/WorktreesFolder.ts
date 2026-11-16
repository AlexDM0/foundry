/** The worktrees root beside the tracker, and the names it gives a ticket's worktree and the Hatch folders in it. */
import { join } from 'node:path';

import { branchNamesOf } from './BranchNames.ts';
import { PRODUCT_NAMES } from './constants/ProductNames.ts';

/** The jobs' Hatch folders, one per job, sit in this folder of the worktrees root. */
export const HATCH_FOLDER = 'hatch';

function worktreesRootOf(repositoryRoot: string): string {
  return join(repositoryRoot, PRODUCT_NAMES.WORKTREES_FOLDER);
}

/** Named as a bare-named branch is: the worktrees root is the tracker's own, so no namespace is needed in it. */
function ticketWorktreeOf(repositoryRoot: string, ticketId: string): string {
  return join(worktreesRootOf(repositoryRoot), branchNamesOf(null).ticketBranchOf(ticketId));
}

function hatchRootOf(repositoryRoot: string): string {
  return join(worktreesRootOf(repositoryRoot), HATCH_FOLDER);
}

export const WorktreesFolder = Object.freeze({
  hatchRootOf,
  ticketWorktreeOf,
  worktreesRootOf,
});
