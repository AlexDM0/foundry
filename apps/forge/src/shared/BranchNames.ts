/**
 * The names a tracker gives its branches. With no namespace they are bare, `ticket-7` and `group-ui`, as a tracker has always named
 * them; with one, they sit under the program's name and the namespace, `forge/web/ticket-7`, so trackers that share a repository never
 * name the same branch.
 */
import { PRODUCT_NAMES } from './constants/ProductNames.ts';

const TICKET_BRANCH_WORD = 'ticket-';
const GROUP_BRANCH_WORD  = 'group-';
const BRANCH_SEPARATOR   = '/';

/** Lower case, so two namespaces never differ only in case on a file system that folds it. */
const BRANCH_NAMESPACE_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/;

export interface BranchNames {
  /** `''` without a namespace; `<program>/<namespace>/` with one. */
  readonly namespacePrefix:    string;
  readonly ticketBranchPrefix: string;
  readonly groupTargetPrefix:  string;
  ticketBranchOf(ticketId: string): string;
  /** A branch under the program's name in another namespace; a tracker without a namespace claims none, as before namespaces. */
  branchIsInAnotherNamespace(branch: string): boolean;
}

/** Why a board may not take a namespace now, or `null` when it may. */
export type BranchNamespaceRefusal =
  | { reason: 'branch-blocks-namespace'; branch: string }
  | { reason: 'namespace-has-branches'; branches: string[] }
  | { reason: 'board-has-branches'; branches: string[] };

function namespacePrefixOf(branchNamespace: string | null): string {
  return branchNamespace === null ? '' : `${PRODUCT_NAMES.PROGRAM}${BRANCH_SEPARATOR}${branchNamespace}${BRANCH_SEPARATOR}`;
}

export function branchNamesOf(branchNamespace: string | null): BranchNames {
  const namespacePrefix    = namespacePrefixOf(branchNamespace);
  const ticketBranchPrefix = `${namespacePrefix}${TICKET_BRANCH_WORD}`;
  const programPrefix      = `${PRODUCT_NAMES.PROGRAM}${BRANCH_SEPARATOR}`;
  return Object.freeze({
    namespacePrefix,
    ticketBranchPrefix,
    groupTargetPrefix:          `${namespacePrefix}${GROUP_BRANCH_WORD}`,
    ticketBranchOf:             (ticketId: string) => `${ticketBranchPrefix}${ticketId}`,
    branchIsInAnotherNamespace: (branch: string) => namespacePrefix !== '' && branch.startsWith(programPrefix) && !branch.startsWith(namespacePrefix),
  });
}

function namespaceIsWellFormed(branchNamespace: string): boolean {
  return BRANCH_NAMESPACE_PATTERN.test(branchNamespace);
}

/**
 * Judged on every branch of the repository; the board's own namespace again is no change. Git keeps a branch as a path, so a branch
 * named as the program or as `<program>/<namespace>` leaves no room under it; branches already in the namespace are another tracker's;
 * and the board's branches under its current names would be left behind.
 */
function refusalOf(branches: readonly string[], current: BranchNames, wantedNamespace: string): BranchNamespaceRefusal | null {
  const wanted = branchNamesOf(wantedNamespace);
  if (wanted.namespacePrefix === current.namespacePrefix) return null;
  const blockingBranch = branches.find((branch) => branch === PRODUCT_NAMES.PROGRAM || `${branch}${BRANCH_SEPARATOR}` === wanted.namespacePrefix);
  if (blockingBranch !== undefined) return { reason: 'branch-blocks-namespace', branch: blockingBranch };
  const namespaceBranches = branches.filter((branch) => branch.startsWith(wanted.namespacePrefix));
  if (namespaceBranches.length > 0) return { reason: 'namespace-has-branches', branches: namespaceBranches };
  const boardBranches = branches.filter((branch) => branch.startsWith(current.ticketBranchPrefix) || branch.startsWith(current.groupTargetPrefix));
  return boardBranches.length === 0 ? null : { reason: 'board-has-branches', branches: boardBranches };
}

export const BranchNamespaceUtil = Object.freeze({
  namespaceIsWellFormed,
  refusalOf,
});
