/**
 * A stored group that breaks the portable rule, read at launch. Nothing migrates, so what matters is that its job fails with advice before
 * git makes a group branch or a worktree under a name another host could not hold, and that a portable group still launches. git answers
 * from the recordings of `src/testing/RecordedGit.ts`: the refused group asks git nothing, and the portable one asks for both branches.
 */
import { existsSync, readFileSync } from 'node:fs';
import path, { join }               from 'node:path';
import { afterEach, expect, test }  from 'bun:test';


import { branchNamesOf }                                  from '../../shared/BranchNames.ts';
import { PRODUCT_NAMES }                                  from '../../shared/constants/ProductNames.ts';
import { boardFixture, ticketFixture }                    from '../../testing/BoardFixtures.ts';
import type { RecordedGitStage, RecordedGitStep }         from '../../testing/RecordedGit.ts';
import { GIT_CALL_SHAPES, useRecordedGit }                from '../../testing/RecordedGit.ts';
import { createScratchDirectory, removeScratchDirectory } from '../../testing/ScratchWorkspace.ts';
import { describeWhenGitIsRecorded }                      from '../../testing/ToolGuard.ts';
import { JobLaunch, type JobLaunchContext }               from './JobLaunch.ts';
import { WatcherFleet }                                   from './WatcherFleet.ts';

const AT = '2026-10-30T10:00:00+01:00';
const MAIN_LINE = 'main';
const PORTABLE_GROUP_BRANCH = 'group-example-shop';
const TICKET_BRANCH = 'ticket-001';

const recordedGit = useRecordedGit();
const folders: string[] = [];

afterEach(() => {
  for (const folder of folders.splice(0)) removeScratchDirectory(folder);
});

function missingBranch(branch: string): RecordedGitStep {
  return { gitArguments: ['rev-parse', '--verify', '--quiet', '--end-of-options', `refs/heads/${branch}^{commit}`], answeredAs: GIT_CALL_SHAPES.RESOLVED_MISSING_REVISION };
}

/**
 * The group branch and the ticket worktree on it, each made with a new branch, then the worktree checked clean. No folder is made by the
 * answers, so the reads of a worktree that exists on disk are not asked.
 */
function portableLaunchOf(rootDirectory: string): RecordedGitStage {
  const worktreesRoot = join(rootDirectory, PRODUCT_NAMES.WORKTREES_FOLDER);
  const ticketWorktree = join(worktreesRoot, TICKET_BRANCH);
  return [
    missingBranch(PORTABLE_GROUP_BRANCH),
    {
      gitArguments: ['worktree', 'add', '--quiet', '-b', PORTABLE_GROUP_BRANCH, join(worktreesRoot, PORTABLE_GROUP_BRANCH), MAIN_LINE],
      answeredAs:   GIT_CALL_SHAPES.QUIET_WORKTREE_ADD_ON_A_NEW_BRANCH,
    },
    missingBranch(TICKET_BRANCH),
    {
      gitArguments: ['worktree', 'add', '-b', TICKET_BRANCH, ticketWorktree, PORTABLE_GROUP_BRANCH],
      answeredAs:   GIT_CALL_SHAPES.WORKTREE_ADD_ON_A_NEW_BRANCH,
    },
    { gitArguments: ['status', '--porcelain=v1', '--untracked-files=all', '--no-renames'], answeredAs: GIT_CALL_SHAPES.STATUS_OF_A_CLEAN_WORKTREE },
  ];
}

async function launchInto(target: string, stageOf: (rootDirectory: string) => RecordedGitStage): Promise<string | null> {
  const rootDirectory = createScratchDirectory('stored-group-root');
  const trackerParent = createScratchDirectory('stored-group-tracker');
  folders.push(rootDirectory, trackerParent);
  const trackerDirectory = join(trackerParent, PRODUCT_NAMES.DATA_FOLDER);
  const { board } = boardFixture({ tickets: [ticketFixture({ id: '001', status: 'in-progress', task: 1 })] });
  const context = {
    workspace:     { rootDirectory, trackerDirectory },
    mainLine:      MAIN_LINE,
    branchNames:   branchNamesOf(null),
    log:           () => undefined,
    platformPorts: { dataFolders: { pathModule: path, foldsCase: false } },
  } as unknown as JobLaunchContext;
  const { job } = board.launchJob({
    kind: 'build', role: 'builder', ticketIds: ['001'], parentJobId: null, attempt: 1, target
  }, AT);
  board.moveJob(job.id, 'preparing', AT);

  await recordedGit.playStage(stageOf(rootDirectory), () => JobLaunch.runBuildJobEffects(context, board, 'example-tracker', []));

  const failureFile = join(WatcherFleet.jobFolderOf(trackerDirectory, job.id), 'worktree-failure.txt');
  return existsSync(failureFile) ? readFileSync(failureFile, 'utf8') : null;
}

describeWhenGitIsRecorded('a build job of a stored group', () => {
  test('a group that breaks the portable rule fails its worktree with advice and asks git for no branch', async () => {
    const failureText = await launchInto('group-Example-Shop', () => []);

    expect(failureText).toContain('The stored group "Example-Shop" is not a portable group name');
  });

  test('a portable group makes its group branch and fails nothing', async () => {
    expect(await launchInto(PORTABLE_GROUP_BRANCH, portableLaunchOf)).toBeNull();
  });
});
