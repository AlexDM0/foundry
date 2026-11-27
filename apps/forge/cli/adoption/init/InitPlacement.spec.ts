/**
 * Where `init` may put a tracker, judged before it writes anything: a folder tracker needs a namespace, overlapping trackers and namespaces are
 * refused naming what holds the place, and a bare root tracker asks git nothing. Git plays recorded answers, so a case also fails when the
 * placement asks git otherwise.
 */
import { mkdirSync } from 'node:fs';
import { join }      from 'node:path';

import {
  afterEach,
  describe,
  expect,
  test
} from 'bun:test';

import { RepositoryLandings }      from '../../../src/lib/git/RepositoryLandings.ts';
import type { RepositoryTracker }  from '../../../src/lib/git/RepositoryLandings.ts';
import { repositoryTrackerListOf } from '../../../src/services/tracker/RepositoryTrackerList.ts';
import { OperationRefusal }        from '../../../src/shared/OperationRefusal.ts';
import { PRODUCT_NAMES }           from '../../../src/shared/constants/ProductNames.ts';
import {
  GIT_CALL_SHAPES,
  RECORDED_PLACEHOLDERS,
  type RecordedGitStage,
  useRecordedGit
} from '../../../src/testing/RecordedGit.ts';
import { createScratchDirectory, removeScratchDirectory } from '../../../src/testing/ScratchWorkspace.ts';
import { describeWhenGitIsRecorded }                      from '../../../src/testing/ToolGuard.ts';
import { chosenRootLineOf, initPlacementOf }              from './InitPlacement.ts';

const recordedGit = useRecordedGit();

const FORGE_TRACKER: RepositoryTracker = { trackerId: 'tracker-example-forge', prefix: 'apps/forge', branchNamespace: 'forge' };

const scratchDirectories: string[] = [];

/** A repository as the files show it: a `.git` folder, the given folders, and a data folder in each listed tracker's folder. */
function scratchRepository(listedTrackers: readonly RepositoryTracker[], folders: readonly string[] = []): string {
  const repositoryDirectory = createScratchDirectory('init-placement');
  scratchDirectories.push(repositoryDirectory);
  mkdirSync(join(repositoryDirectory, '.git'));
  for (const folder of folders) mkdirSync(join(repositoryDirectory, folder), { recursive: true });
  const list = repositoryTrackerListOf(repositoryDirectory);
  if (list === null) throw new Error('the scratch repository keeps no list');
  mkdirSync(join(list.files.trackerListFilePath, '..'), { recursive: true });
  for (const tracker of listedTrackers) {
    mkdirSync(join(repositoryDirectory, tracker.prefix, PRODUCT_NAMES.DATA_FOLDER), { recursive: true });
    RepositoryLandings.writeTrackerEntry(list.files, tracker);
  }
  return repositoryDirectory;
}

/** The repository's branches as `for-each-ref` lists them at its root: the one recorded branch, named as the case needs. */
function branchListOf(branch: string): RecordedGitStage {
  return [{
    gitArguments: ['for-each-ref', '--format=%(refname:short)', 'refs/heads'],
    answeredAs:   GIT_CALL_SHAPES.BRANCH_NAMES_OF_ONE,
    filledIn:     { [RECORDED_PLACEHOLDERS.BRANCH]: branch },
  }];
}

async function refusalTextOf(stage: RecordedGitStage, place: () => unknown): Promise<string> {
  return await recordedGit.playStage(stage, async () => {
    try {
      place();
    } catch (error) {
      if (error instanceof OperationRefusal) return error.message;
      throw error;
    }
    throw new Error('the placement was not refused');
  });
}

afterEach(() => {
  for (const directory of scratchDirectories.splice(0)) removeScratchDirectory(directory);
});

describeWhenGitIsRecorded('where init puts a tracker', () => {
  test('a bare tracker at the root of a repository with no list asks git nothing and stays out of the list', async () => {
    const repositoryDirectory = scratchRepository([]);

    const placement = await recordedGit.playStage([], async () => initPlacementOf(repositoryDirectory, null));

    expect(placement.location.projectPrefix).toBe('');
    expect(placement.listToWrite).toBeNull();
  });

  test('a folder of the repository without a namespace is refused before git is asked, naming the flag', async () => {
    const repositoryDirectory = scratchRepository([], ['apps/gaia']);

    const refusal = await refusalTextOf([], () => initPlacementOf(join(repositoryDirectory, 'apps', 'gaia'), null));

    expect(refusal).toContain('is the folder apps/gaia of the repository');
    expect(refusal).toContain('--namespace <name>');
  });

  test('a folder beside a listed tracker, with a free namespace, is placed and listed', async () => {
    const repositoryDirectory = scratchRepository([FORGE_TRACKER], ['apps/gaia']);

    const placement = await recordedGit.playStage(branchListOf('main'), async () => initPlacementOf(join(repositoryDirectory, 'apps', 'gaia'), 'gaia'));

    expect(placement.location.projectPrefix).toBe('apps/gaia');
    expect(placement.listToWrite?.repositoryRoot).toBe(repositoryDirectory);
  });

  test('a listed tracker below the folder, or above it, is refused and named', async () => {
    const repositoryDirectory = scratchRepository([FORGE_TRACKER], ['apps/forge/cli']);

    const below = await refusalTextOf([], () => initPlacementOf(repositoryDirectory, null));
    const above = await refusalTextOf([], () => initPlacementOf(join(repositoryDirectory, 'apps', 'forge', 'cli'), 'cli'));

    expect(below).toContain('A tracker sits below this folder, in the folder apps/forge of');
    expect(above).toContain('A tracker already governs this folder from the folder apps/forge of');
  });

  test('a namespace another tracker lists is refused before git is asked', async () => {
    const repositoryDirectory = scratchRepository([FORGE_TRACKER], ['apps/gaia']);

    const refusal = await refusalTextOf([], () => initPlacementOf(join(repositoryDirectory, 'apps', 'gaia'), 'forge'));

    expect(refusal).toContain('The namespace forge is the tracker\'s in the folder apps/forge of');
  });

  test('a branch named as the program leaves the namespace no room and is refused', async () => {
    const repositoryDirectory = scratchRepository([], ['apps/gaia']);

    const refusal = await refusalTextOf(branchListOf(PRODUCT_NAMES.PROGRAM), () => initPlacementOf(join(repositoryDirectory, 'apps', 'gaia'), 'gaia'));

    expect(refusal).toContain(`The branch ${PRODUCT_NAMES.PROGRAM} leaves git no room for branches named ${PRODUCT_NAMES.PROGRAM}/gaia/ticket-<id>`);
  });

  test('a branch under the bare names is another tracker\'s, so it does not refuse a new tracker\'s namespace', async () => {
    const repositoryDirectory = scratchRepository([], ['apps/gaia']);

    const placement = await recordedGit.playStage(branchListOf('ticket-003'), async () => initPlacementOf(join(repositoryDirectory, 'apps', 'gaia'), 'gaia'));

    expect(placement.listToWrite).not.toBeNull();
  });

  test('a listed tracker whose data folder is gone blocks nothing', async () => {
    const repositoryDirectory = scratchRepository([FORGE_TRACKER], ['apps/gaia']);
    removeScratchDirectory(join(repositoryDirectory, 'apps', 'forge', PRODUCT_NAMES.DATA_FOLDER));

    const placement = await recordedGit.playStage([], async () => initPlacementOf(repositoryDirectory, null));

    expect(placement.listToWrite).toBeNull();
  });
});

describe('the root init says it chose', () => {
  test('is said only when init chose a folder other than the one it ran in, and never under --root', () => {
    expect(chosenRootLineOf(undefined, '/srv/example/apps/gaia', '/srv/example')).toBe(
      'Chose /srv/example, the root of the repository\'s main checkout; pass --root <folder> to track one folder of it instead.',
    );
    expect(chosenRootLineOf(undefined, '/srv/example', '/srv/example')).toBeNull();
    expect(chosenRootLineOf('apps/gaia', '/srv/example', '/srv/example/apps/gaia')).toBeNull();
  });
});
