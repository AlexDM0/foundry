/**
 * The trackers of one repository as its tracker list names them, judged on disk: a listed tracker counts only while its data folder is
 * there, so a tracker removed by hand never blocks a folder. A tracker at the repository root with bare branch names is never listed, so
 * such a tracker writes nothing here, as before trackers shared a repository.
 */
import { existsSync, mkdirSync, statSync } from 'node:fs';
import { join }                            from 'node:path';

import type { RepositoryLandingFiles, RepositoryTracker, TrackerListReading } from '../../adapters/repository-landings/RepositoryLandings.ts';
import { RepositoryLandings }                                                 from '../../adapters/repository-landings/RepositoryLandings.ts';
import { repositoryRootWithoutGit }                                           from '../../lib/git/RepositoryRootWithoutGit.ts';
import { GIT_ENTRY_NAME }                                                     from '../../lib/git/constants/GitConventions.ts';
import { PRODUCT_NAMES }                                                      from '../../shared/constants/ProductNames.ts';
import { type LockTaker, withLockAt }                                         from './GenerationLock.ts';

const PREFIX_SEPARATOR = '/';

export interface RepositoryTrackerList {
  repositoryRoot: string;
  files:          RepositoryLandingFiles;
}

/** Why a tracker may not sit at a prefix or take a namespace, naming the tracker that holds it; `null` when it may. */
export type TrackerPlacementRefusal =
  | { reason: 'tracker-above' | 'tracker-below' | 'namespace-held'; tracker: RepositoryTracker }
  | null;

export type TrackerListing = { verdict: 'listed' } | { verdict: 'not-listed'; reason: string };

/** `null` when the repository keeps no git directory of its own beside its main checkout, a submodule's or a bare one: no list is kept. */
export function repositoryTrackerListOf(projectDirectory: string): RepositoryTrackerList | null {
  const repositoryRoot = repositoryRootWithoutGit(projectDirectory);
  if (repositoryRoot === null) return null;
  const gitCommonDirectory = join(repositoryRoot, GIT_ENTRY_NAME);
  try {
    if (!statSync(gitCommonDirectory).isDirectory()) return null;
  } catch {
    return null;
  }
  return { repositoryRoot, files: RepositoryLandings.landingFilesOf(gitCommonDirectory, PRODUCT_NAMES.PROGRAM) };
}

/** A tracker that wants the list kept: one in a folder of its repository, or one whose branches carry a namespace. */
export function trackerBelongsInTheList(prefix: string, branchNamespace: string | null): boolean {
  return prefix !== '' || branchNamespace !== null;
}

export function readListedTrackers(list: RepositoryTrackerList): TrackerListReading {
  const reading = RepositoryLandings.readTrackerList(list.files);
  if (reading.verdict !== 'readable') return reading;
  const trackerIsThere = (tracker: RepositoryTracker) => existsSync(join(list.repositoryRoot, tracker.prefix, PRODUCT_NAMES.DATA_FOLDER));
  return { verdict: 'readable', trackers: reading.trackers.filter(trackerIsThere) };
}

function prefixLiesUnder(prefix: string, ancestorPrefix: string): boolean {
  return ancestorPrefix === '' ? prefix !== '' : prefix.startsWith(`${ancestorPrefix}${PREFIX_SEPARATOR}`);
}

/** The tracker's own entry, by `ownTrackerId`, is passed over: a tracker never refuses itself. */
export function trackerPlacementRefusalOf(
  listedTrackers: readonly RepositoryTracker[], ownTrackerId: string | null, prefix: string, branchNamespace: string | null,
): TrackerPlacementRefusal {
  const others = listedTrackers.filter((tracker) => tracker.trackerId !== ownTrackerId);
  const above  = others.find((tracker) => prefixLiesUnder(prefix, tracker.prefix));
  if (above !== undefined) return { reason: 'tracker-above', tracker: above };
  const below = others.find((tracker) => prefixLiesUnder(tracker.prefix, prefix));
  if (below !== undefined) return { reason: 'tracker-below', tracker: below };
  const holder = branchNamespace === null ? undefined : others.find((tracker) => tracker.branchNamespace === branchNamespace);
  return holder === undefined ? null : { reason: 'namespace-held', tracker: holder };
}

/** Under the list's own lock, since the write rewrites the whole list and a sibling tracker may be writing its entry. */
export async function listTracker(
  list: RepositoryTrackerList, tracker: RepositoryTracker, now: () => Date, lockTaker: LockTaker,
): Promise<TrackerListing> {
  try {
    mkdirSync(list.files.lockDirectoryPath, { recursive: true });
    const write = await withLockAt(list.files.lockDirectoryPath, () => RepositoryLandings.writeTrackerEntry(list.files, tracker), now, lockTaker);
    if (write.verdict === 'written') return { verdict: 'listed' };
    if (write.verdict === 'newer-version') return { verdict: 'not-listed', reason: `it is of version ${write.version}, newer than this ${PRODUCT_NAMES.PROGRAM} writes` };
    if (write.verdict === 'malformed') return { verdict: 'not-listed', reason: write.problems.join('; ') };
    return { verdict: 'not-listed', reason: write.reason };
  } catch (error) {
    return { verdict: 'not-listed', reason: error instanceof Error ? error.message : String(error) };
  }
}
