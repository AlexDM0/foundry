/**
 * Which trackers of a repository count, and where a new one may go. What matters: a listed tracker whose data folder is gone never blocks
 * a folder; above and below are folder relations, never string prefixes (`apps/forge-two` is beside `apps/forge`); a tracker never refuses
 * its own entry; a bare tracker at the root stays out of the list; and listing a tracker keeps every other tracker's entry.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join }                                   from 'node:path';

import {
  afterEach,
  describe,
  expect,
  test
} from 'bun:test';

import type { RepositoryTracker }                         from '../../lib/git/RepositoryLandings.ts';
import { PRODUCT_NAMES }                                  from '../../shared/constants/ProductNames.ts';
import { createScratchDirectory, removeScratchDirectory } from '../../testing/ScratchWorkspace.ts';
import { NO_LOCK_HOLDER_READS_AS_GONE }                   from './GenerationLock.ts';
import {
  listTracker,
  readListedTrackers,
  repositoryTrackerListOf,
  trackerBelongsInTheList,
  trackerPlacementRefusalOf
} from './RepositoryTrackerList.ts';

const FROZEN_NOW = (): Date => new Date('2026-11-16T09:00:00Z');

const FORGE_TRACKER: RepositoryTracker = { trackerId: 'tracker-example-forge', prefix: 'apps/forge', branchNamespace: 'forge' };
const GAIA_TRACKER: RepositoryTracker  = { trackerId: 'tracker-example-gaia', prefix: 'apps/gaia', branchNamespace: 'gaia' };

const scratchDirectories: string[] = [];

/** A repository as the files show it, with a data folder in each of `trackerFolders`. */
function scratchRepository(trackerFolders: readonly string[]): string {
  const repositoryDirectory = createScratchDirectory('repository-tracker-list');
  scratchDirectories.push(repositoryDirectory);
  mkdirSync(join(repositoryDirectory, '.git'));
  for (const folder of trackerFolders) mkdirSync(join(repositoryDirectory, folder, PRODUCT_NAMES.DATA_FOLDER), { recursive: true });
  return repositoryDirectory;
}

afterEach(() => {
  for (const directory of scratchDirectories.splice(0)) removeScratchDirectory(directory);
});

describe('where a tracker may sit', () => {
  test('a tracker in a folder above, or one below, is refused and named', () => {
    expect(trackerPlacementRefusalOf([FORGE_TRACKER], null, 'apps/forge/cli', 'other')).toEqual({ reason: 'tracker-above', tracker: FORGE_TRACKER });
    expect(trackerPlacementRefusalOf([FORGE_TRACKER], null, 'apps', 'other')).toEqual({ reason: 'tracker-below', tracker: FORGE_TRACKER });
    expect(trackerPlacementRefusalOf([FORGE_TRACKER], null, '', null)).toEqual({ reason: 'tracker-below', tracker: FORGE_TRACKER });
  });

  test('a folder whose name only starts with a tracker\'s folder is beside it, not below it', () => {
    expect(trackerPlacementRefusalOf([FORGE_TRACKER], null, 'apps/forge-two', 'two')).toBeNull();
  });

  test('a namespace another tracker holds is refused; a bare tracker holds none', () => {
    expect(trackerPlacementRefusalOf([FORGE_TRACKER], null, 'apps/gaia', 'forge')).toEqual({ reason: 'namespace-held', tracker: FORGE_TRACKER });
    const bareRootTracker: RepositoryTracker = { trackerId: 'tracker-example-root', prefix: 'tools', branchNamespace: null };
    expect(trackerPlacementRefusalOf([bareRootTracker], null, 'apps/gaia', 'gaia')).toBeNull();
  });

  test('a tracker\'s own entry never refuses it', () => {
    expect(trackerPlacementRefusalOf([FORGE_TRACKER], FORGE_TRACKER.trackerId, 'apps/forge', 'forge')).toBeNull();
  });

  test('only a tracker in a folder or with a namespace belongs in the list', () => {
    expect(trackerBelongsInTheList('', null)).toBe(false);
    expect(trackerBelongsInTheList('', 'forge')).toBe(true);
    expect(trackerBelongsInTheList('apps/forge', 'forge')).toBe(true);
  });
});

describe('the repository\'s list', () => {
  test('a folder outside any repository, or a checkout with no git folder of its own, keeps no list', () => {
    const outside = createScratchDirectory('repository-tracker-list-outside');
    scratchDirectories.push(outside);
    expect(repositoryTrackerListOf(outside)).toBeNull();
  });

  test('a linked worktree finds the main checkout\'s list', () => {
    const repositoryDirectory = scratchRepository([]);
    const worktreeDirectory   = join(repositoryDirectory, '.claude', 'worktrees', 'person');
    mkdirSync(join(repositoryDirectory, '.git', 'worktrees', 'person'), { recursive: true });
    mkdirSync(worktreeDirectory, { recursive: true });
    writeFileSync(join(worktreeDirectory, '.git'), `gitdir: ${join(repositoryDirectory, '.git', 'worktrees', 'person')}\n`);

    expect(repositoryTrackerListOf(join(worktreeDirectory, 'apps', 'gaia'))?.files).toEqual(repositoryTrackerListOf(repositoryDirectory)?.files);
  });

  test('listing a tracker keeps the other tracker\'s entry, and a listed tracker whose data folder is gone is passed over', async () => {
    const repositoryDirectory = scratchRepository(['apps/forge']);
    const list = repositoryTrackerListOf(repositoryDirectory);
    if (list === null) throw new Error('the scratch repository keeps no list');

    expect(await listTracker(list, FORGE_TRACKER, FROZEN_NOW, NO_LOCK_HOLDER_READS_AS_GONE)).toEqual({ verdict: 'listed' });
    expect(await listTracker(list, GAIA_TRACKER, FROZEN_NOW, NO_LOCK_HOLDER_READS_AS_GONE)).toEqual({ verdict: 'listed' });

    expect(readFileSync(list.files.trackerListFilePath, 'utf8')).toContain(FORGE_TRACKER.trackerId);
    expect(readListedTrackers(list)).toEqual({ verdict: 'readable', trackers: [FORGE_TRACKER] });
  });
});
