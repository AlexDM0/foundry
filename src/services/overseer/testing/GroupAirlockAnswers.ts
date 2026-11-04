/**
 * The recorded git answer steps of a group's Airlock, for a harness of `createRecordedAirlocksHarness`: the group's reads, a candidate's
 * reads and a fast-forward in a checkout. A spec joins them into one answer set for each state of the repository. Test-only.
 */
import { mkdirSync }   from 'node:fs';
import { join }        from 'node:path';
import {
  ancestryAsked,
  commitResolved,
  currentBranchRead,
  emptyRangeCounted,
  mergePredicted,
  revisionMissing,
  treeRead,
  worktreeBranchRead
} from '../../../testing/RecordedAirlockGit.ts';
import {
  GIT_CALL_SHAPES,
  RECORDED_PLACEHOLDERS,
  type RecordedGitStage,
  type RecordedGitStep
} from '../../../testing/RecordedGit.ts';
import { MOVED_AIRLOCK_IDS, stepIn } from './AirlockAnswerSets.ts';
import {
  createRecordedAirlocksHarness,
  RECORDED_AIRLOCK_IDS,
  type AirlocksHarness,
  type HarnessTicket
} from './AirlocksHarness.ts';

const {
  MAIN_TIP, TICKET_TIP, TICKET_TREE, MERGED_TREE
} = RECORDED_AIRLOCK_IDS;

export const GROUP = 'group-example';

export function groupWorktreeOf(current: AirlocksHarness): string {
  return join(`${current.repository}-worktrees`, GROUP);
}

/** A harness on folders, its repository holding the `.git` folder git's recorded common-dir answer names. */
export function createRecordedGroupHarness(tickets: readonly HarnessTicket[], refreshAfterMainCommits?: number): AirlocksHarness {
  const current = createRecordedAirlocksHarness(tickets, refreshAfterMainCommits === undefined ? {} : { GROUP_REFRESH_AFTER_MAIN_COMMITS: refreshAfterMainCommits });
  mkdirSync(join(current.repository, '.git'), { recursive: true });
  return current;
}

export function aheadOfTheGroup(commits: 'none' | 'one'): RecordedGitStep {
  return commits === 'none'
    ? emptyRangeCounted(GROUP, 'main')
    : { gitArguments: ['rev-list', '--count', `${GROUP}..main`], answeredAs: GIT_CALL_SHAPES.COMMITS_AHEAD_ONE };
}

/** The group and main tips and the refresh prediction, as every sweep of a group asks them. */
export function groupReads(groupTip: string, mainCommitsAhead: 'none' | 'one'): RecordedGitStep[] {
  return [
    commitResolved(`refs/heads/${GROUP}`, groupTip),
    commitResolved('refs/heads/main', MAIN_TIP),
    aheadOfTheGroup(mainCommitsAhead),
    mergePredicted(GROUP, 'main', MOVED_AIRLOCK_IDS.OTHER_TREE),
  ];
}

/** The ticket's branch read and merged in its worktree; `holdsTarget` is whether it already holds `targetTip`. */
export function candidateReads(current: AirlocksHarness, ticketId: string, targetTip: string, holdsTarget: boolean): RecordedGitStep[] {
  const worktree = current.worktreeOf(ticketId);
  return [
    treeRead(`refs/heads/ticket-${ticketId}`, TICKET_TREE),
    commitResolved(`refs/heads/ticket-${ticketId}`, TICKET_TIP),
    mergePredicted(GROUP, `ticket-${ticketId}`, TICKET_TREE),
    mergePredicted('main', `ticket-${ticketId}`, MERGED_TREE),
    stepIn(worktree, revisionMissing('MERGE_HEAD')),
    commitResolved(targetTip, targetTip),
    commitResolved(TICKET_TIP, TICKET_TIP),
    stepIn(worktree, commitResolved('HEAD', TICKET_TIP)),
    ancestryAsked(targetTip, TICKET_TIP, holdsTarget),
    stepIn(worktree, treeRead('HEAD', TICKET_TREE)),
    treeRead(TICKET_TIP, TICKET_TREE),
  ];
}

/** The fast-forward of `branch` checked out in `directory` to `commit`, handing on to `landed`. */
export function fastForwardIn(directory: string, branch: string, branchTip: string, commit: string, landed: RecordedGitStage): RecordedGitStep[] {
  return [
    stepIn(directory, worktreeBranchRead(branch)),
    stepIn(directory, currentBranchRead(branch)),
    stepIn(directory, commitResolved(`refs/heads/${branch}`, branchTip)),
    stepIn(directory, { gitArguments: ['status', '--porcelain=v1', '-z', '--untracked-files=all'], answeredAs: GIT_CALL_SHAPES.NUL_STATUS_OF_A_CLEAN_CHECKOUT }),
    stepIn(directory, {
      gitArguments: ['diff', '--name-only', '--no-renames', '-z', 'HEAD', commit, '--'],
      answeredAs:   GIT_CALL_SHAPES.FILES_CHANGED_UP_TO_A_COMMIT,
      filledIn:     { [RECORDED_PLACEHOLDERS.PATH]: 'cart.ts' },
    }),
    stepIn(directory, { gitArguments: ['merge', '--ff-only', '--quiet', commit], answeredAs: GIT_CALL_SHAPES.FAST_FORWARD_TO_A_COMMIT, movesTo: landed }),
  ];
}
