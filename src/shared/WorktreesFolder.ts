/** The worktrees root beside the repository, and the names it gives a ticket's branch and worktree and the Hatch folders in it. */
import { join } from 'node:path';

import { PRODUCT_NAMES } from './constants/ProductNames.ts';

/** The jobs' Hatch folders, one per job, sit in this folder of the worktrees root. */
export const HATCH_FOLDER = 'hatch';

function worktreesRootOf(repositoryRoot: string): string {
  return join(repositoryRoot, PRODUCT_NAMES.WORKTREES_FOLDER);
}

function ticketBranchOf(ticketId: string): string {
  return `ticket-${ticketId}`;
}

function ticketWorktreeOf(repositoryRoot: string, ticketId: string): string {
  return join(worktreesRootOf(repositoryRoot), ticketBranchOf(ticketId));
}

function hatchRootOf(repositoryRoot: string): string {
  return join(worktreesRootOf(repositoryRoot), HATCH_FOLDER);
}

export const WorktreesFolder = Object.freeze({
  hatchRootOf,
  ticketBranchOf,
  ticketWorktreeOf,
  worktreesRootOf,
});
