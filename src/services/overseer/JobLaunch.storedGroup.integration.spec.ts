/**
 * A stored group that breaks the portable rule, read at launch. Nothing migrates, so what matters is that its job fails with advice before
 * git makes a group branch or a worktree under a name another host could not hold, and that a portable group still launches.
 */
import { existsSync, readFileSync } from 'node:fs';
import path, { join }               from 'node:path';
import {
  afterEach,
  describe,
  expect,
  test
} from 'bun:test';

import { PRODUCT_NAMES }               from '../../shared/constants/ProductNames.ts';
import { boardFixture, ticketFixture } from '../../testing/BoardFixtures.ts';
import {
  commitFile,
  createScratchDirectory,
  createScratchGitRepository,
  gitOutputIn,
  removeScratchDirectory
} from '../../testing/ScratchWorkspace.ts';
import { JobLaunch, type JobLaunchContext } from './JobLaunch.ts';
import { WatcherFleet }                     from './WatcherFleet.ts';

const AT = '2026-10-30T10:00:00+01:00';

const folders: string[] = [];

afterEach(() => {
  for (const folder of folders.splice(0)) removeScratchDirectory(folder);
});

async function launchInto(target: string): Promise<{ rootDirectory: string; failureText: string | null }> {
  const rootDirectory = createScratchGitRepository('stored-group-root');
  const trackerParent = createScratchDirectory('stored-group-tracker');
  folders.push(rootDirectory, trackerParent);
  commitFile(rootDirectory, 'example.txt', 'Example Agency\n');
  const trackerDirectory = join(trackerParent, PRODUCT_NAMES.DATA_FOLDER);
  const { board } = boardFixture({ tickets: [ticketFixture({ id: '001', status: 'in-progress', task: 1 })] });
  const context = {
    workspace:         { rootDirectory, trackerDirectory },
    mainLine:          gitOutputIn(rootDirectory, ['rev-parse', '--abbrev-ref', 'HEAD']),
    groupTargetPrefix: 'group-',
    log:               () => undefined,
    platformPorts:     { dataFolders: { pathModule: path, foldsCase: false } },
  } as unknown as JobLaunchContext;
  const { job } = board.launchJob({
    kind: 'build', role: 'builder', ticketIds: ['001'], parentJobId: null, attempt: 1, target
  }, AT);
  board.moveJob(job.id, 'preparing', AT);

  await JobLaunch.runBuildJobEffects(context, board, 'example-tracker', []);

  const failureFile = join(WatcherFleet.jobFolderOf(trackerDirectory, job.id), 'worktree-failure.txt');
  return { rootDirectory, failureText: existsSync(failureFile) ? readFileSync(failureFile, 'utf8') : null };
}

describe('a build job of a stored group', () => {
  test('a group that breaks the portable rule fails its worktree with advice and makes no group branch', async () => {
    const { rootDirectory, failureText } = await launchInto('group-Example-Shop');

    expect(failureText).toContain('The stored group "Example-Shop" is not a portable group name');
    expect(gitOutputIn(rootDirectory, ['branch', '--list', 'group-*'])).toBe('');
  });

  test('a portable group makes its group branch and fails nothing', async () => {
    const { rootDirectory, failureText } = await launchInto('group-example-shop');

    expect(failureText).toBeNull();
    expect(gitOutputIn(rootDirectory, ['branch', '--list', 'group-*'])).toContain('group-example-shop');
  });
});
