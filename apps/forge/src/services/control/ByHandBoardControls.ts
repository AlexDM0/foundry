/**
 * The by-hand board kinds: a note in the log, and the board's branch namespace, set in the hold so no job starts between the check and the
 * write. Git lists the branches at the board's repository root.
 */
import type { JobKind }                       from '../../domain/tracker-model/@types/Job.ts';
import { GitProcess }                         from '../../lib/git/GitProcess.ts';
import type { ControlCommandOf as CommandOf } from '../../shared/@types/ControlCommand.ts';
import { BranchNamespaceUtil, branchNamesOf } from '../../shared/BranchNames.ts';
import { OperationRefusal }                   from '../../shared/OperationRefusal.ts';
import type { BoardTransaction }              from '../tracker/BoardTransaction.ts';

const BRANCH_LIST_ARGUMENTS = ['for-each-ref', '--format=%(refname:short)', 'refs/heads'] as const;

/**
 * The Assistant and the product owner work on no branch, and a Hephaestus's stop leaves its Assistant on the board while the next start
 * boots a new one, so counting them would refuse a namespace on every board a Hephaestus ever served.
 */
const JOB_KINDS_ON_NO_BRANCH: readonly JobKind[] = ['assistant', 'product-owner'];

function recordNote(command: CommandOf<'log-note'>, change: BoardTransaction): { at: string; text: string } {
  change.board.recordNote(command.text, change.at);
  return { at: change.at, text: command.text };
}

function setNamespace(command: CommandOf<'namespace-set'>, change: BoardTransaction) {
  const { board } = change;
  const wantedNamespace = command.namespace;
  const jobsOnBranches  = board.jobs().filter((job) => !JOB_KINDS_ON_NO_BRANCH.includes(job.kind));
  if (jobsOnBranches.length > 0) throw new OperationRefusal('refused', { kind: 'namespace-board-has-jobs', jobCount: jobsOnBranches.length });
  const branchList = GitProcess.run(change.workspace.rootDirectory, BRANCH_LIST_ARGUMENTS);
  if (!GitProcess.succeeded(branchList)) {
    throw new OperationRefusal('refused', { kind: 'namespace-branch-list-failed', reason: GitProcess.failureReasonOf(branchList, BRANCH_LIST_ARGUMENTS) });
  }
  const branches = branchList.standardOutput.split('\n').filter((branch) => branch !== '');
  const refusal  = BranchNamespaceUtil.refusalOf(branches, branchNamesOf(board.branchNamespace()), wantedNamespace);
  if (refusal !== null) throw new OperationRefusal('refused', { kind: 'namespace-not-free', refusal, wantedNamespace });
  return board.setBranchNamespace(wantedNamespace, change.at);
}

export const BY_HAND_BOARD_CONTROLS = {
  'log-note':      recordNote,
  'namespace-set': setNamespace,
} as const;
