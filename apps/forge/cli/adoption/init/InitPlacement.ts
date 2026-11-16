/**
 * Where a new tracker may sit in its repository and which branch namespace it may take, judged before `init` writes anything: no tracker
 * above or below it, a namespace for one in a folder of its repository, and a namespace no other tracker and no branch holds.
 */
import { realpathSync } from 'node:fs';

import { GitProcess }             from '../../../src/lib/git/GitProcess.ts';
import type { RepositoryTracker } from '../../../src/lib/git/RepositoryLandings.ts';
import { projectLocationOf }      from '../../../src/services/tracker/ProjectLocation.ts';
import type { ProjectLocation }   from '../../../src/services/tracker/ProjectLocation.ts';
import {
  readListedTrackers,
  repositoryTrackerListOf,
  trackerBelongsInTheList,
  trackerPlacementRefusalOf
} from '../../../src/services/tracker/RepositoryTrackerList.ts';
import type { RepositoryTrackerList, TrackerPlacementRefusal } from '../../../src/services/tracker/RepositoryTrackerList.ts';
import { BranchNamespaceUtil, branchNamesOf }                  from '../../../src/shared/BranchNames.ts';
import { OperationRefusal }                                    from '../../../src/shared/OperationRefusal.ts';
import { PRODUCT_NAMES }                                       from '../../../src/shared/constants/ProductNames.ts';

const BRANCH_LIST_ARGUMENTS = ['for-each-ref', '--format=%(refname:short)', 'refs/heads'] as const;

const EXAMPLE_TICKET_ID = '<id>';

const NOTHING_WRITTEN = 'Nothing was written.';

/** The tracker list to write the new tracker into, or `null` when it stays out of the list, as a bare tracker at the root does. */
export interface InitPlacement {
  location:    ProjectLocation;
  listToWrite: RepositoryTrackerList | null;
}

function realPathOf(path: string): string {
  try {
    return realpathSync(path);
  } catch {
    return path;
  }
}

function folderWordsOf(prefix: string): string {
  return prefix === '' ? 'the repository root' : `the folder ${prefix}`;
}

function placementRefusalTextOf(refusal: NonNullable<TrackerPlacementRefusal>, repositoryRoot: string): string {
  const { tracker } = refusal;
  switch (refusal.reason) {
    case 'tracker-above':
      return `A tracker already governs this folder from ${folderWordsOf(tracker.prefix)} of ${repositoryRoot}, so a second one here would `
        + `split its board. ${NOTHING_WRITTEN}`;
    case 'tracker-below':
      return `A tracker sits below this folder, in ${folderWordsOf(tracker.prefix)} of ${repositoryRoot}, so a tracker here would govern its `
        + `files too. Track a folder beside it instead. ${NOTHING_WRITTEN}`;
    case 'namespace-held':
      return `The namespace ${tracker.branchNamespace ?? ''} is the tracker's in ${folderWordsOf(tracker.prefix)} of ${repositoryRoot}; `
        + `choose another name. ${NOTHING_WRITTEN}`;
  }
}

function listUnreadableTextOf(list: RepositoryTrackerList, reason: string): string {
  return `The repository's tracker list ${list.files.trackerListFilePath} could not be read (${reason}), so ${PRODUCT_NAMES.PROGRAM} cannot `
    + `tell whether another tracker sits above or below this folder. ${NOTHING_WRITTEN}`;
}

function listedTrackersOrRefuse(list: RepositoryTrackerList): RepositoryTracker[] {
  const reading = readListedTrackers(list);
  switch (reading.verdict) {
    case 'readable':
      return reading.trackers;
    case 'newer-version':
      throw new OperationRefusal('refused', listUnreadableTextOf(list, `it is of version ${reading.version}, newer than this ${PRODUCT_NAMES.PROGRAM} reads`));
    case 'malformed':
      throw new OperationRefusal('refused', listUnreadableTextOf(list, reading.problems.join('; ')));
    case 'unreadable':
      throw new OperationRefusal('refused', listUnreadableTextOf(list, reading.reason));
  }
}

/** A branch under the namespace, or one named as the program or the namespace itself, leaves the new tracker no branch of its own. */
function refuseANamespaceABranchHolds(repositoryRoot: string, branchNamespace: string): void {
  const branchList = GitProcess.run(repositoryRoot, BRANCH_LIST_ARGUMENTS);
  if (!GitProcess.succeeded(branchList)) {
    throw new OperationRefusal('refused', `git did not list the branches (${GitProcess.failureReasonOf(branchList, BRANCH_LIST_ARGUMENTS)}). ${NOTHING_WRITTEN}`);
  }
  const branches = branchList.standardOutput.split('\n').filter((branch) => branch !== '');
  const refusal  = BranchNamespaceUtil.refusalOf(branches, branchNamesOf(null), branchNamespace);
  const example  = branchNamesOf(branchNamespace).ticketBranchOf(EXAMPLE_TICKET_ID);
  // A new tracker has no branches yet, so bare-named branches are another tracker's, never its own left behind.
  if (refusal === null || refusal.reason === 'board-has-branches') return;
  if (refusal.reason === 'branch-blocks-namespace') {
    throw new OperationRefusal('refused', `The branch ${refusal.branch} leaves git no room for branches named ${example}; rename it, or choose another name. ${NOTHING_WRITTEN}`);
  }
  throw new OperationRefusal(
    'refused',
    `The namespace ${branchNamespace} already holds the branches ${refusal.branches.join(', ')}, so it is another tracker's; choose another name. ${NOTHING_WRITTEN}`,
  );
}

/**
 * A tracker in a folder of its repository needs a namespace, or its ticket branches would meet a sibling's. A bare tracker at the root
 * asks git nothing more than before.
 */
export function initPlacementOf(rootDirectory: string, branchNamespace: string | null): InitPlacement {
  const location = projectLocationOf(rootDirectory);
  if (location.projectPrefix !== '' && branchNamespace === null) {
    throw new OperationRefusal(
      'refused',
      `${rootDirectory} is the folder ${location.projectPrefix} of the repository ${location.repositoryRoot}, so its tracker needs a branch `
      + `namespace that keeps its branches apart from another tracker's: pass --namespace <name>. ${NOTHING_WRITTEN}`,
    );
  }
  const list = repositoryTrackerListOf(rootDirectory);
  if (list !== null) {
    const refusal = trackerPlacementRefusalOf(listedTrackersOrRefuse(list), null, location.projectPrefix, branchNamespace);
    if (refusal !== null) throw new OperationRefusal('refused', placementRefusalTextOf(refusal, list.repositoryRoot));
  }
  if (branchNamespace !== null) refuseANamespaceABranchHolds(location.repositoryRoot, branchNamespace);
  return { location, listToWrite: list !== null && trackerBelongsInTheList(location.projectPrefix, branchNamespace) ? list : null };
}

/** Said only when `init` chose a folder other than the one it ran in, so a run from a subfolder learns where its tracker went. */
export function chosenRootLineOf(rootOption: string | undefined, currentDirectory: string, rootDirectory: string): string | null {
  if (rootOption !== undefined || realPathOf(currentDirectory) === realPathOf(rootDirectory)) return null;
  return `Chose ${rootDirectory}, the root of the repository's main checkout; pass --root <folder> to track one folder of it instead.`;
}
