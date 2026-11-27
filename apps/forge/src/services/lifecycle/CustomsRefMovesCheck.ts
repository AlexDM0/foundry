/**
 * V14: no ref moved during the job past the moves Hephaestus and the board's other jobs make, read from the log and, for a tracker sharing
 * its repository, the landing journal and the refs it watches.
 */
import { type RepositoryLandingFiles, RepositoryLandings } from '../../adapters/repository-landings/RepositoryLandings.ts';
import type { JobOutcome }                                 from '../../domain/tracker-model/@types/Job.ts';
import type { LogRecord }                                  from '../../domain/tracker-model/@types/LogRecord.ts';
import { type GitPathStyle, GitPaths }                     from '../../lib/git/GitPaths.ts';
import type { BranchNames }                                from '../../shared/BranchNames.ts';

import type { CustomsSubject } from './@types/CustomsSubject.ts';
import type { CheckVerdict }   from './@types/CustomsVerdict.ts';
import type {
  HephaestusRefNaming,
  RefMovesAllowed,
  SharedRepositoryRefs,
  WatchedRefs
} from './@types/RefMoves.ts';
import { CustomsReadings, HOST_PATH_STYLE, PASSED } from './CustomsReadings.ts';

const ALONE_IN_ITS_REPOSITORY: SharedRepositoryRefs = { journaledLandings: [], watchedRefs: null };

/** The job endings that move a target's ref: the landings V14 lets pass. */
const LANDING_OUTCOMES: readonly JobOutcome[] = ['landed', 'integrated', 'refreshed', 'committed'];

/** Each ref's commit and each detached worktree's HEAD, read from the repository the worktree belongs to. */
function refsOf(worktreePath: string): Record<string, string> | null {
  const refLines = CustomsReadings.gitLines(worktreePath, ['for-each-ref', '--format=%(refname) %(objectname)']);
  const worktreeLines = CustomsReadings.gitLines(worktreePath, ['worktree', 'list', '--porcelain']);
  if (refLines === null || worktreeLines === null) return null;
  const refs: Record<string, string> = {};
  for (const line of refLines) {
    const [refName, commit] = line.split(' ');
    if (refName !== undefined && commit !== undefined) refs[refName] = commit;
  }
  let worktree = '';
  let head = '';
  for (const line of worktreeLines) {
    if (line.startsWith('worktree ')) worktree = line.slice('worktree '.length);
    if (line.startsWith('HEAD ')) head = line.slice('HEAD '.length);
    if (line === 'detached') refs[`HEAD:${worktree}`] = head;
  }
  return refs;
}

const WORKTREE_HEAD_PREFIX = 'HEAD:';

const BRANCH_REF_PREFIX = 'refs/heads/';

/** A `HEAD:<path>` key in canonical form, so git's listed spelling and a joined path meet; a stored snapshot keeps git's spelling. */
function comparableRefOf(style: GitPathStyle, ref: string): string {
  return ref.startsWith(WORKTREE_HEAD_PREFIX) ? `${WORKTREE_HEAD_PREFIX}${GitPaths.canonicalOf(style, ref.slice(WORKTREE_HEAD_PREFIX.length))}` : ref;
}

function comparableRefsOf(style: GitPathStyle, refs: Readonly<Record<string, string>>): Map<string, { ref: string; commit: string }> {
  return new Map(Object.entries(refs).map(([ref, commit]) => [comparableRefOf(style, ref), { ref, commit }]));
}

/** Every ref for a tracker with bare branch names; for a namespaced one, its own branches, the main line and its own worktrees' HEADs. */
function refIsWatched(style: GitPathStyle, ref: string, watchedRefs: WatchedRefs | undefined): boolean {
  if (watchedRefs === undefined) return true;
  if (ref.startsWith(WORKTREE_HEAD_PREFIX)) return GitPaths.relativeInsideOf(style, watchedRefs.worktreesRoot, ref.slice(WORKTREE_HEAD_PREFIX.length)) !== null;
  const branch = ref.startsWith(BRANCH_REF_PREFIX) ? ref.slice(BRANCH_REF_PREFIX.length) : null;
  return branch !== null && (branch === watchedRefs.mainLine || branch.startsWith(watchedRefs.namespacePrefix));
}

/** The refs that moved from `launchRefs` to `nowRefs` past every exemption, named as git spelled them. */
function foreignRefsMovedOf(
  style: GitPathStyle,
  snapshots: { launchRefs: Readonly<Record<string, string>>; nowRefs: Readonly<Record<string, string>> },
  refMovesAllowed: RefMovesAllowed,
  ownWorktree: string
): string[] {
  const launchRefs = comparableRefsOf(style, snapshots.launchRefs);
  const nowRefs = comparableRefsOf(style, snapshots.nowRefs);
  const exempt = new Set([refMovesAllowed.ownBranch, ...refMovesAllowed.otherJobBranches].map((branch) => `refs/heads/${branch}`));
  exempt.add(comparableRefOf(style, `${WORKTREE_HEAD_PREFIX}${ownWorktree}`));
  for (const refreshHead of refMovesAllowed.airlockWorktreeHeads) exempt.add(comparableRefOf(style, refreshHead));
  const removedAfterLandings = new Set(refMovesAllowed.removedAfterLandings);
  const loggedJobRefs = new Set(refMovesAllowed.loggedJobBranches.map((branch) => `refs/heads/${branch}`));
  const snapshotFolders = refMovesAllowed.snapshotFolders ?? [];
  const isSnapshotHead = (ref: string): boolean => ref.startsWith(WORKTREE_HEAD_PREFIX)
    && snapshotFolders.some((folder) => GitPaths.relativeInsideOf(style, folder, ref.slice(WORKTREE_HEAD_PREFIX.length)) !== null);
  const moved = [...new Set([...launchRefs.keys(), ...nowRefs.keys()])].filter((ref) => {
    if (exempt.has(ref) || isSnapshotHead(ref)) return false;
    if (!refIsWatched(style, nowRefs.get(ref)?.ref ?? launchRefs.get(ref)?.ref ?? ref, refMovesAllowed.watchedRefs)) return false;
    const after = nowRefs.get(ref)?.commit;
    if (launchRefs.get(ref)?.commit === after) return false;
    if (after === undefined && removedAfterLandings.has(ref)) return false;
    if (after !== undefined && loggedJobRefs.has(ref)) return false;
    return !refMovesAllowed.recordedLandings.some((landing) => landing.ref === ref && landing.commit === after);
  });
  return moved.map((ref) => nowRefs.get(ref)?.ref ?? launchRefs.get(ref)?.ref ?? ref).sort();
}

function onlyOwnRefsMoved(subject: CustomsSubject): CheckVerdict {
  const { launchSnapshot, refMovesAllowed } = subject;
  if (launchSnapshot === undefined || refMovesAllowed === undefined) return CustomsReadings.refused('foreign-ref-moved', ['no launch snapshot']);
  const nowRefs = refsOf(subject.worktreePath);
  if (nowRefs === null) return CustomsReadings.refused('git-failed', ['for-each-ref']);
  const moved = foreignRefsMovedOf(subject.pathStyle ?? HOST_PATH_STYLE, { launchRefs: launchSnapshot.refs, nowRefs }, refMovesAllowed, subject.worktreePath);
  return moved.length === 0 ? PASSED : CustomsReadings.refused('foreign-ref-moved', moved);
}

/** `null` for a tracker whose branches keep their bare names: it watches every ref, as it always has. */
function watchedRefsOf(branchNames: BranchNames, mainLine: string, worktreesRoot: string): WatchedRefs | null {
  return branchNames.namespacePrefix === '' ? null : { mainLine, namespacePrefix: branchNames.namespacePrefix, worktreesRoot };
}

/**
 * What a tracker sharing its repository adds to V14: the journal's landings, none for a tracker with no journal or an unreadable one, and
 * the refs it watches.
 */
function sharedRepositoryRefsOf(landingFiles: RepositoryLandingFiles | null, watchedRefs: WatchedRefs | null): SharedRepositoryRefs {
  const journal = landingFiles === null ? null : RepositoryLandings.readLandingJournal(landingFiles);
  return { journaledLandings: journal?.verdict === 'readable' ? journal.landings : [], watchedRefs };
}

/**
 * V14's exemptions from the log: each landing on its job's target at its commit, what a main-line landing deletes, every refresh's and
 * constitution commit's worktree, and the ticket branches of the jobs ending after the verified job's launch. A tracker sharing its
 * repository adds each journaled landing, a sibling's among them, and the refs it watches.
 */
function refMovesAllowedOf(
  logRecords: readonly LogRecord[],
  naming: HephaestusRefNaming,
  sharedRepository: SharedRepositoryRefs = ALONE_IN_ITS_REPOSITORY
): RefMovesAllowed {
  const launchById = new Map<string, { target: string | null; ticketIds: readonly string[] }>();
  const recordedLandings: { ref: string; commit: string }[] = [];
  const removedAfterLandings: string[] = [];
  const airlockWorktreeHeads: string[] = [];
  const loggedJobBranches = new Set<string>();
  let ownJobLaunched = false;
  for (const record of logRecords) {
    if (record.kind === 'job-launched' && record.jobId === naming.ownJobId) ownJobLaunched = true;
    if (record.kind === 'job-ended' && ownJobLaunched) {
      for (const ticketId of launchById.get(record.jobId)?.ticketIds ?? []) loggedJobBranches.add(naming.ticketBranchOf(ticketId));
    }
    if (record.kind === 'job-launched') {
      launchById.set(record.jobId, { target: record.fields.target, ticketIds: record.fields.ticketIds });
      if (record.fields.kind === 'refresh' && record.fields.target !== null) airlockWorktreeHeads.push(`HEAD:${naming.refreshWorktreeOf(record.fields.target)}`);
      if (record.fields.kind === 'constitution-commit') airlockWorktreeHeads.push(`HEAD:${naming.constitutionCommitWorktreeOf(record.jobId)}`);
    }
    if (record.kind !== 'job-ended' || !LANDING_OUTCOMES.includes(record.fields.outcome) || record.fields.commit === undefined) continue;
    const launch = launchById.get(record.jobId);
    if (launch === undefined || launch.target === null) continue;
    recordedLandings.push({ ref: `${BRANCH_REF_PREFIX}${launch.target}`, commit: record.fields.commit });
    if (record.fields.outcome !== 'landed') continue;
    for (const ticketId of launch.ticketIds) {
      removedAfterLandings.push(`refs/heads/${naming.ticketBranchOf(ticketId)}`);
      const groupBranch = naming.releasedGroupBranchOf(ticketId);
      if (groupBranch !== null) removedAfterLandings.push(`refs/heads/${groupBranch}`);
    }
  }
  for (const landing of sharedRepository.journaledLandings) recordedLandings.push({ ref: `${BRANCH_REF_PREFIX}${landing.target}`, commit: landing.commit });
  return {
    ownBranch:         naming.ownBranch,
    otherJobBranches:  naming.otherJobBranches,
    loggedJobBranches: [...loggedJobBranches],
    recordedLandings,
    removedAfterLandings,
    airlockWorktreeHeads,
    ...(naming.snapshotFolders === undefined ? {} : { snapshotFolders: naming.snapshotFolders }),
    ...(sharedRepository.watchedRefs === null ? {} : { watchedRefs: sharedRepository.watchedRefs }),
  };
}

export const CustomsRefMovesCheck = Object.freeze({
  refsOf,
  foreignRefsMovedOf,
  onlyOwnRefsMoved,
  watchedRefsOf,
  sharedRepositoryRefsOf,
  refMovesAllowedOf,
});
