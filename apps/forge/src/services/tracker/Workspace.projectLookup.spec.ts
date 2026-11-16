/**
 * Finding a tracker that sits in a project folder of its repository, with no tracker at the root. What matters: an agent's checkout under
 * the project finds it by the walk up and asks no git; a person's checkout nested in the main checkout and a sibling checkout beside it
 * find it through git, by applying their own place in their checkout to the main checkout, the nearest tracker winning; and a start at the
 * root of any checkout finds none, as the walk in the main checkout never goes above its root. git answers from the recordings of
 * `src/testing/RecordedGit.ts`; the `.git` entries are planted, since a checkout's place is read from them and runs no git.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join }                     from 'node:path';

import { afterAll, expect } from 'bun:test';

import {
  GIT_CALL_SHAPES,
  RECORDED_PLACEHOLDERS,
  type RecordedGitStep,
  useRecordedGit
} from '../../testing/RecordedGit.ts';
import { createCanonicalScratchDirectory, removeScratchDirectory } from '../../testing/ScratchWorkspace.ts';
import { testWhenGitIsRecorded }                                   from '../../testing/ToolGuard.ts';
import { writeMinimalTracker }                                     from '../../testing/TrackerFileFixtures.ts';
import { findWorkspace }                                           from './Workspace.ts';

const recordedGit = useRecordedGit();
const scratchDirectories: string[] = [];

afterAll(() => {
  for (const directory of scratchDirectories) removeScratchDirectory(directory);
});

function scratchDirectory(prefix: string): string {
  const directory = createCanonicalScratchDirectory(prefix);
  scratchDirectories.push(directory);
  return directory;
}

function folderMade(...segments: string[]): string {
  const folder = join(...segments);
  mkdirSync(folder, { recursive: true });
  return folder;
}

interface TwoTrackerRepository {
  repository:   string;
  forgeProject: string;
  gaiaProject:  string;
}

/** A main checkout with a tracker in `apps/forge` and one in `apps/gaia`, and none at its root. */
function twoTrackerRepository(prefix: string): TwoTrackerRepository {
  const repository = scratchDirectory(prefix);
  folderMade(repository, '.git');
  return {
    repository,
    forgeProject: writeMinimalTracker(folderMade(repository, 'apps', 'forge')),
    gaiaProject:  writeMinimalTracker(folderMade(repository, 'apps', 'gaia')),
  };
}

/** A linked checkout of `repository` at `checkoutRoot`, its `.git` file naming the main checkout's common folder as git writes it. */
function linkedCheckout(repository: string, checkoutRoot: string): string {
  folderMade(checkoutRoot);
  writeFileSync(join(checkoutRoot, '.git'), `gitdir: ${join(repository, '.git', 'worktrees', 'example')}\n`);
  return checkoutRoot;
}

function commonFolderOfALinkedCheckoutOf(repository: string): RecordedGitStep {
  return {
    gitArguments: ['rev-parse', '--git-common-dir'],
    answeredAs:   GIT_CALL_SHAPES.COMMON_FOLDER_IN_A_WORKTREE,
    filledIn:     { [RECORDED_PLACEHOLDERS.REPOSITORY]: repository },
  };
}

const COMMON_FOLDER_AT_THE_ROOT: RecordedGitStep = { gitArguments: ['rev-parse', '--git-common-dir'], answeredAs: GIT_CALL_SHAPES.COMMON_FOLDER_AT_THE_ROOT };

testWhenGitIsRecorded('an agent\'s checkout under a project tracker finds it by the walk up and asks no git', () => {
  const { repository, forgeProject } = twoTrackerRepository('project-lookup-agent');
  const agentCheckout = linkedCheckout(repository, join(forgeProject, '.forge-worktrees', 'ticket-7'));
  expect(findWorkspace(folderMade(agentCheckout, 'apps', 'forge', 'src'))?.rootDirectory).toBe(forgeProject);
});

testWhenGitIsRecorded('a person\'s checkout nested in the main checkout finds the tracker of the project it stands in', async () => {
  const { repository, forgeProject, gaiaProject } = twoTrackerRepository('project-lookup-person');
  const personCheckout = linkedCheckout(repository, join(repository, '.claude', 'worktrees', 'person'));
  const fromForge = await recordedGit.playStage([commonFolderOfALinkedCheckoutOf(repository)], async () => findWorkspace(folderMade(personCheckout, 'apps', 'forge')));
  const fromGaia = await recordedGit.playStage([commonFolderOfALinkedCheckoutOf(repository)], async () => findWorkspace(folderMade(personCheckout, 'apps', 'gaia', 'page')));
  expect(fromForge?.rootDirectory).toBe(forgeProject);
  expect(fromGaia?.rootDirectory).toBe(gaiaProject);
});

testWhenGitIsRecorded('a sibling checkout beside the main checkout finds the nearest tracker above its place in the main checkout', async () => {
  const { repository, forgeProject } = twoTrackerRepository('project-lookup-sibling');
  const siblingCheckout = linkedCheckout(repository, scratchDirectory('project-lookup-sibling-checkout'));
  const startDirectory = folderMade(siblingCheckout, 'apps', 'forge', 'src', 'example');
  expect((await recordedGit.playStage([commonFolderOfALinkedCheckoutOf(repository)], async () => findWorkspace(startDirectory)))?.rootDirectory).toBe(forgeProject);
});

testWhenGitIsRecorded('the root of a person\'s checkout finds no tracker when every tracker sits in a project', async () => {
  const { repository } = twoTrackerRepository('project-lookup-person-root');
  const personCheckout = linkedCheckout(repository, join(repository, '.claude', 'worktrees', 'person'));
  expect(await recordedGit.playStage([commonFolderOfALinkedCheckoutOf(repository)], async () => findWorkspace(personCheckout))).toBeNull();
});

testWhenGitIsRecorded('the root of the main checkout finds no tracker when every tracker sits in a project', async () => {
  const { repository } = twoTrackerRepository('project-lookup-main-root');
  expect(await recordedGit.playStage([COMMON_FOLDER_AT_THE_ROOT], async () => findWorkspace(repository))).toBeNull();
});

testWhenGitIsRecorded('the walk in the main checkout stops at its root and never reaches a tracker above it', async () => {
  const outerFolder = writeMinimalTracker(scratchDirectory('project-lookup-outer'));
  const repository = folderMade(outerFolder, 'repository');
  folderMade(repository, '.git');
  const siblingCheckout = linkedCheckout(repository, scratchDirectory('project-lookup-outer-sibling'));
  const startDirectory = folderMade(siblingCheckout, 'apps', 'forge');
  expect(await recordedGit.playStage([commonFolderOfALinkedCheckoutOf(repository)], async () => findWorkspace(startDirectory))).toBeNull();
});
