/**
 * `merge accept` and `merge update`. What matters: an accept is refused with merge approval off, for a ticket not waiting for merge, and
 * whenever git does not predict a clean merge into the target's current tip, and only a clean prediction sets `mergeAccepted`; an update
 * merges the target into the ticket's worktree with no Airlock held, leaving the queue mark for the Overseer's gate run, while a conflict is
 * aborted, the worktree put back at its tip, and the ticket loses its review done and its accept. A merge git refuses to start resets
 * nothing, so an uncommitted edit in its way stays.
 * The folders are real; git plays the recorded answers of `src/testing/RecordedGit.ts`, so each case names the git calls its command makes.
 */
import { mkdirSync } from 'node:fs';
import { join }      from 'node:path';

import { afterEach, expect } from 'bun:test';


import type { Board }                                   from '../../lib/tracker-model/Board.ts';
import type { ControlCommand }                          from '../../shared/@types/ControlCommand.ts';
import { PRODUCT_NAMES }                                from '../../shared/constants/ProductNames.ts';
import { boardFixture, refusalDetailOf, ticketFixture } from '../../testing/BoardFixtures.ts';
import { ECHOED_CONTROL_CONTEXT }                       from '../../testing/EchoedControlContext.ts';
import { queueOnCurrentGreen }                          from '../../testing/GreenQueue.ts';
import {
  ancestryAsked,
  branchTreeRead,
  commitResolved,
  createPlantedRepository,
  currentBranchRead,
  mergedIn,
  mergePredicted,
  plantedCommitOf,
  plantedTreeOf,
  revisionMissing,
  treeRead,
  unmergedFilesRead
} from '../../testing/RecordedAirlockGit.ts';
import type { RecordedGitStage }                                  from '../../testing/RecordedGit.ts';
import { GIT_CALL_SHAPES, RECORDED_PLACEHOLDERS, useRecordedGit } from '../../testing/RecordedGit.ts';
import { removeScratchDirectory }                                 from '../../testing/ScratchWorkspace.ts';
import { testWhenGitIsRecorded }                                  from '../../testing/ToolGuard.ts';
import type { TrackerChange }                                     from '../tracker/TrackerPipeline.ts';
import { workspacePathsFor }                                      from '../tracker/Workspace.ts';
import { ControlService }                                         from './ControlService.ts';

const AT = '2026-11-03T10:00:00+01:00';
const BRANCH = 'ticket-001';
const MAIN_TIP = plantedCommitOf('main');
const BRANCH_TIP = plantedCommitOf(BRANCH);
const MERGED_TREE = plantedTreeOf('merged');

const recordedGit = useRecordedGit();

let repository: string | null = null;

afterEach(() => {
  if (repository !== null) removeScratchDirectory(repository);
  repository = null;
});

interface Scenario {
  board: Board;
  apply: (command: ControlCommand, stage: RecordedGitStage) => Promise<unknown>;
}

/** Ticket 001 in review on main, its worktree folder planted and its green current and queued on the planted branch tree. */
function scenario(mergeApprovalIsOn = true): Scenario {
  const root = createPlantedRepository('airlock-controls');
  repository = root;
  mkdirSync(join(root, PRODUCT_NAMES.WORKTREES_FOLDER, BRANCH), { recursive: true });
  const { board } = boardFixture({ tickets: [ticketFixture({ id: '001', status: 'in-review' })] });
  queueOnCurrentGreen(board, '001', 'main', AT, plantedTreeOf(BRANCH));
  board.setApproval('merge', mergeApprovalIsOn, AT);
  const change = {
    board, workspace: workspacePathsFor(root), at: AT, malformedTickets: []
  } as unknown as TrackerChange;
  return { board, apply: (command, stage) => recordedGit.playStage(stage, () => Promise.resolve(ControlService.apply(command, change, ECHOED_CONTROL_CONTEXT).result)) };
}

async function refusalOf(attempt: Promise<unknown>): Promise<unknown> {
  let refusal: unknown = null;
  await attempt.catch((error: unknown) => {
    refusal = refusalDetailOf(() => {
      throw error;
    });
  });
  return refusal;
}

const ACCEPT: ControlCommand = { kind: 'merge-accept', ticketReference: '1' };
const UPDATE: ControlCommand = { kind: 'merge-update', ticketReference: '1' };
const MAIN_LINE_READ = currentBranchRead('main');
const MERGE_IN_START: RecordedGitStage = [
  MAIN_LINE_READ,
  commitResolved('HEAD', BRANCH_TIP),
  commitResolved('refs/heads/main', MAIN_TIP),
  commitResolved(MAIN_TIP, MAIN_TIP),
  commitResolved('HEAD', BRANCH_TIP),
  ancestryAsked(MAIN_TIP, BRANCH_TIP, false),
];

testWhenGitIsRecorded('merge accept: a clean prediction sets mergeAccepted and logs it; a second accept changes nothing', async () => {
  const { board, apply } = scenario();
  expect(await apply(ACCEPT, [MAIN_LINE_READ, branchTreeRead(BRANCH), mergePredicted('main', BRANCH, MERGED_TREE)]))
    .toMatchObject({ logged: [{ kind: 'merge-acceptance-set', ticketId: '001', fields: { state: 'accepted' } }] });
  expect(board.ticketIsMergeAccepted('001')).toBe(true);
  expect(await apply(ACCEPT, [MAIN_LINE_READ])).toEqual({ logged: [], changed: false });
});

testWhenGitIsRecorded('merge accept: a branch that would conflict with the target\'s tip is refused with its files, and stays unaccepted', async () => {
  const { board, apply } = scenario();
  expect(await refusalOf(apply(ACCEPT, [MAIN_LINE_READ, branchTreeRead(BRANCH), mergePredicted('main', BRANCH, MERGED_TREE, 'base.ts')]))).toEqual({
    reason: 'merge-accept-would-conflict', ticketId: '001', target: 'main', conflictedFiles: ['base.ts']
  });
  expect(board.ticketIsMergeAccepted('001')).toBe(false);
});

testWhenGitIsRecorded('merge accept: is refused with merge approval off, and for a ticket whose review done is gone', async () => {
  expect(await refusalOf(scenario(false).apply(ACCEPT, []))).toEqual({ reason: 'merge-approval-off', ticketId: '001' });
  const { board, apply } = scenario();
  board.setTicketMergeQueued('001', false, AT);
  expect(await refusalOf(apply(ACCEPT, [MAIN_LINE_READ]))).toEqual({ reason: 'merge-accept-of-a-ticket-not-waiting', ticketId: '001', status: 'in-review' });
});

testWhenGitIsRecorded('merge accept: a ticket whose branch moved past its green is not waiting, so it is refused', async () => {
  const { apply } = scenario();
  expect(await refusalOf(apply(ACCEPT, [MAIN_LINE_READ, treeRead(`refs/heads/${BRANCH}`, plantedTreeOf('moved'))])))
    .toMatchObject({ reason: 'merge-accept-of-a-ticket-not-waiting' });
});

testWhenGitIsRecorded('merge update: merges the target into the worktree with no job launched, keeping the queue mark for the Overseer\'s gate run', async () => {
  const { board, apply } = scenario();
  const update = await apply(UPDATE, [...MERGE_IN_START, mergedIn(MAIN_TIP), commitResolved('HEAD', plantedCommitOf('merged'))]);
  expect(update).toMatchObject({ logged: [{ kind: 'merge-updated', ticketId: '001', fields: { target: 'main', outcome: 'merged' } }] });
  expect(board.jobs()).toEqual([]);
  expect(board.ticketIsMergeQueued('001')).toBe(true);
  expect(board.greenIsCurrent('001', MERGED_TREE, board.greenPhaseOf('001'))).toBe(false);
});

testWhenGitIsRecorded('merge update: a conflict is aborted, the worktree put back at its tip, and the ticket loses its review done and its accept', async () => {
  const { board, apply } = scenario();
  board.setTicketMergeAccepted('001', true, AT);
  const update = await apply(UPDATE, [
    ...MERGE_IN_START,
    mergedIn(MAIN_TIP, 'base.ts'),
    unmergedFilesRead('base.ts'),
    commitResolved('MERGE_HEAD', MAIN_TIP),
    { gitArguments: ['merge', '--abort'], answeredAs: GIT_CALL_SHAPES.MERGE_ABORT_OF_A_CONFLICT },
    commitResolved('HEAD', BRANCH_TIP),
  ]);
  expect(update).toMatchObject({ logged: [{ kind: 'merge-updated', fields: { outcome: 'conflicted' } }] });
  expect(board.ticketIsMergeQueued('001')).toBe(false);
  expect(board.ticketIsMergeAccepted('001')).toBe(false);
});

testWhenGitIsRecorded('merge update: is refused with merge approval off and for a ticket a job holds', async () => {
  expect(await refusalOf(scenario(false).apply(UPDATE, []))).toEqual({ reason: 'merge-approval-off', ticketId: '001' });
  const { board, apply } = scenario();
  board.launchJob({
    kind: 'review', role: 'reviewer', ticketIds: ['001'], parentJobId: null, attempt: 1, target: 'main'
  }, AT);
  expect(await refusalOf(apply(UPDATE, [MAIN_LINE_READ]))).toEqual({ reason: 'merge-update-of-a-ticket-not-waiting', ticketId: '001', status: 'in-review' });
});

testWhenGitIsRecorded('merge update: a merge git refuses for an uncommitted edit in its way is refused, the worktree never reset, so the edit stays', async () => {
  const { board, apply } = scenario();
  const refusal = await refusalOf(apply(UPDATE, [
    ...MERGE_IN_START,
    {
      gitArguments: ['merge', '--no-ff', '--no-edit', '--quiet', MAIN_TIP],
      answeredAs:   GIT_CALL_SHAPES.MERGE_IN_BLOCKED_BY_A_LOCAL_CHANGE,
      filledIn:     { [RECORDED_PLACEHOLDERS.PATH]: 'base.ts' },
    },
    { gitArguments: ['diff', '--name-only', '--diff-filter=U', '-z'], answeredAs: GIT_CALL_SHAPES.NO_UNMERGED_FILE_OF_A_REFUSED_MERGE },
    revisionMissing('MERGE_HEAD'),
    commitResolved('HEAD', BRANCH_TIP),
  ]));
  expect(refusal).toMatchObject({ reason: 'merge-update-failed', ticketId: '001', target: 'main' });
  expect(board.ticketIsMergeQueued('001')).toBe(true);
});
