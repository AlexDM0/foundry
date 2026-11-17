/**
 * Verification by code of what a session left (design section 5.1, V1 to V17): nothing it says is taken as true, so each check reads git,
 * the ticket body and the report itself, and answers a wordless verdict. A role runs only the checks its column of the table names.
 */
import { createHash } from 'node:crypto';
import {
  existsSync,
  lstatSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  statSync
} from 'node:fs';
import path, { join, relative, resolve } from 'node:path';

import { AIRLOCK_AGENT_REPORT_SCHEMA, BUILDER_REPORT_SCHEMA, REVIEWER_REPORT_SCHEMA } from '../../adapters/reports/ReportSchemas.ts';
import { reportVerdictOf, type JsonSchema }                                           from '../../adapters/reports/ReportValidation.ts';
import { TicketAcceptanceUtil }                                                       from '../../adapters/tickets/utils/TicketAcceptanceUtil.ts';
import { type GitPathStyle, GitPaths }                                                from '../../lib/git/GitPaths.ts';
import { type GitHookPolicy, type GitRun, GitProcess }                                from '../../lib/git/GitProcess.ts';
import { GitWorktrees }                                                               from '../../lib/git/GitWorktrees.ts';
import { type RepositoryLanding, type RepositoryLandingFiles, RepositoryLandings }    from '../../lib/git/RepositoryLandings.ts';
import { GIT_PATHSPEC_ARGUMENT_CHARACTERS }                                           from '../../lib/git/constants/GitConventions.ts';
import { GitArgumentsUtil }                                                           from '../../lib/git/utils/GitArgumentsUtil.ts';
import type { JobOutcome }                                                            from '../../lib/tracker-model/@types/Job.ts';
import type { LogRecord }                                                             from '../../lib/tracker-model/@types/LogRecord.ts';
import type { PipelineGate }                                                          from '../../lib/tracker-model/@types/Pipeline.ts';
import { EntityOwnershipUtil }                                                        from '../../lib/tracker-model/utils/EntityOwnershipUtil.ts';
import { TicketBodyHashUtil }                                                         from '../../lib/tracker-model/utils/TicketBodyHashUtil.ts';
import type { BranchNames }                                                           from '../../shared/BranchNames.ts';
import { PRODUCT_NAMES }                                                              from '../../shared/constants/ProductNames.ts';
import { ProjectPathsUtil }                                                           from '../../shared/utils/ProjectPathsUtil.ts';

/** A fixer is a builder one attempt on, and is verified as one. */
/**
 * `airlock-agent` is the ticket's last worker resumed into the Airlock for a conflict or a red merged tree; a conflict re-reviewer in the
 * Airlock is verified as a `reviewer`.
 */
export type VerifiedRole = 'builder' | 'reviewer' | 'airlock-agent' | 'pipeline-agent';

/** The roles that end with a report: the pipeline agent is a session, verified at each turn end with no report. */
export type ReportingRole = Exclude<VerifiedRole, 'pipeline-agent'>;

export type VerificationCheck =
  | 'V1' | 'V2' | 'V3' | 'V4' | 'V5' | 'V6' | 'V7' | 'V8' | 'V9' | 'V10' | 'V11' | 'V12' | 'V13' | 'V14' | 'V15' | 'V16' | 'V17';

export type VerificationRefusalReason =
  | 'report-invalid'
  | 'head-not-reported'
  | 'history-rewritten'
  | 'no-commit-since-start'
  | 'worktree-dirty'
  | 'data-folder-touched'
  | 'ticket-body-changed'
  | 'ai-attribution-in-range'
  | 'acceptance-without-evidence'
  | 'fixed-finding-outside-range'
  | 'merge-unresolved'
  | 'checks-definition-changed'
  | 'changed-outside-home-and-reach'
  | 'instruction-file-changed'
  | 'finding-not-filed-by-job'
  | 'branch-touches-agent-config'
  | 'foreign-ref-moved'
  | 'gate-unclaimed'
  | 'head-moved'
  | 'git-failed';

export interface MergeUnderVerification {
  branchTip:       string;
  targetTip:       string;
  conflictedFiles: readonly string[];
}

/** What V13 and V14 compare the job's end with, taken as its session is first launched. */
export interface LaunchSnapshot {
  /** Every ref's commit, and each detached worktree's HEAD keyed `HEAD:<path>`. */
  refs:              Readonly<Record<string, string>>;
  /** The hooks folder's names and contents as one digest; `null` when the folder is missing. */
  hooksFolderDigest: string | null;
}

/** V14's exemptions: refs only the Overseer or another job moves. */
export interface RefMovesAllowed {
  ownBranch:            string;
  /** The branches of the other jobs on the board, each moved by its own session. */
  otherJobBranches:     readonly string[];
  /** The ticket branches of the jobs that ended after this job launched, which their sessions moved before ending: exempt only while they exist. */
  loggedJobBranches:    readonly string[];
  /** Each landing the Overseer recorded, as the ref it moved and the commit it moved it to. */
  recordedLandings:     readonly { ref: string; commit: string }[];
  /** The branches the Overseer deletes after a landing, a released group's and each landed ticket's: exempt only once gone. */
  removedAfterLandings: readonly string[];
  /**
   * The detached HEADs of the Airlock's refresh worktrees and constitution commit worktrees, keyed `HEAD:<path>`: added, moved and removed
   * by the Overseer alone.
   */
  airlockWorktreeHeads: readonly string[];
  /** Absent: every ref is watched, as for a tracker whose branches keep their bare names. */
  watchedRefs?:         WatchedRefs;
}

/**
 * The refs a tracker that names its branches in a namespace owns. Every other branch, tag, stash, remote and detached HEAD belongs to a
 * sibling tracker or a person working beside it, and moves without failing the job.
 */
export interface WatchedRefs {
  mainLine:        string;
  /** `BranchNames.namespacePrefix`: the tracker's ticket and group branches all start with it. */
  namespacePrefix: string;
  /** A detached HEAD below it is one of the tracker's own worktrees'. */
  worktreesRoot:   string;
}

/** What a tracker sharing its repository adds to V14: every tracker's journaled landings, and the refs it watches. */
export interface SharedRepositoryRefs {
  /** The landing journal's entries: the branch each landing moved, as its tracker names it, and the commit it moved it to. */
  journaledLandings: readonly Pick<RepositoryLanding, 'target' | 'commit'>[];
  watchedRefs:       WatchedRefs | null;
}

const ALONE_IN_ITS_REPOSITORY: SharedRepositoryRefs = { journaledLandings: [], watchedRefs: null };

/**
 * What a job of an entity may change (E2, E11). A path belongs to the deepest home that holds it, so a path that a deeper home of another
 * entity holds is that entity's, though one of `homes` holds it too. A `reach` path stays writable inside another entity's home.
 */
export interface WritableFolders {
  /** The stage entity's homes, repository folders leading with `/`; `/` among them for the root entity, which owns every path no home holds. */
  homes:      readonly string[];
  /** The stage entity's `reach`: repository paths outside its homes, each leading with `/`. */
  reach:      readonly string[];
  /** The homes of every other entity of the pipeline. */
  otherHomes: readonly string[];
}

/**
 * Where the tracker's project lies in its repository, and what a branch may change besides it. With the prefix `''` the whole repository
 * is the project, and every check judges it as it always has, unless the pipeline has entities.
 */
export interface ProjectScope {
  /** `ProjectLocation.projectPrefix`: the project's folder from the repository root, `/`-separated, `''` at the root. */
  projectPrefix:    string;
  /** The pipeline's `reach`: the repository paths besides the project a branch may change, each leading with `/`. */
  reach:            readonly string[];
  /** On a pipeline with entities: every entity's home, leading with `/`. V5 and V13 protect each of them as they protect the root. */
  entityHomes?:     readonly string[];
  /** A job of an entity: V17 holds its branch to these folders, in place of the project's folder and `reach`. */
  writableFolders?: WritableFolders;
}

/** How the Overseer names the refs around its landings, which the log records only by ticket and target. */
export interface OverseerRefNaming {
  /** The job being verified: only the jobs ending after its launch moved a ticket branch past its launch snapshot. */
  ownJobId:                     string;
  ownBranch:                    string;
  otherJobBranches:             readonly string[];
  ticketBranchOf:               (ticketId: string) => string;
  /** The group branch landing this ticket on the main line releases and deletes; `null` for a ticket releasing no group. */
  releasedGroupBranchOf:        (ticketId: string) => string | null;
  refreshWorktreeOf:            (groupBranch: string) => string;
  constitutionCommitWorktreeOf: (jobId: string) => string;
}

/** The job endings that move a target's ref: the landings V14 lets pass. */
const LANDING_OUTCOMES: readonly JobOutcome[] = ['landed', 'integrated', 'refreshed', 'committed'];

export interface CustomsSubject {
  role:              VerifiedRole;
  worktreePath:      string;
  /** The worktree's HEAD at launch, the branch tip with `MERGE_HEAD` at the target tip for an Airlock agent, the merged commit after it. */
  startCommit:       string;
  /** V3 measures from it when set: the start of the failed build attempts this one retries, whose commits its branch already holds. */
  workStartCommit?:  string;
  /** The report as parsed from the session's structured output, unvalidated. */
  report:            unknown;
  ticketBody:        string;
  bodyHashAtLaunch:  string;
  /** V10's merge, for an Airlock agent. */
  merge?:            MergeUnderVerification;
  /**
   * The gate catalogue, every gate whatever phases run it: V11 reads each one's `definedBy`, V15 the ones an agent runs; absent or empty,
   * both pass.
   */
  gates?:            readonly Readonly<PipelineGate>[];
  /**
   * V11 also: the tracked files, as repository paths, each role's resolved instruction list names, the constitution's path among them,
   * which a branch changes only where its ticket names them (`InstructionFiles.trackedInstructionPathsOf`).
   */
  instructionFiles?: readonly string[];
  /**
   * V11 also: the line the branch lands on. When set, an instruction file counts as changed only where the branch changed it itself; a
   * change that reached the branch through a merge of this line, such as a constitution commit, is not the worker's edit.
   */
  target?:           string;
  /** V12: the job being verified, and the log as stored plus this hold's records. */
  jobId?:            string;
  logRecords?:       readonly LogRecord[];
  /** V13 and V14: what was snapshotted at launch; without it V14 refuses, since nothing proves no ref moved. */
  launchSnapshot?:   LaunchSnapshot;
  refMovesAllowed?:  RefMovesAllowed;
  /** How a path compares with git's spelling, from the `DataFolders` port; the host's path module without case folding when absent. */
  pathStyle?:        GitPathStyle;
  /**
   * V5, V11, V13 and V17; absent for a tracker at its repository's root whose pipeline has no entities. `worktreePath` is the worktree's
   * root either way.
   */
  projectScope?:     ProjectScope;
}

/** `facts` name what failed: paths, commits or labels, never words. */
export type CheckVerdict = { verdict: 'passed' } | { verdict: 'refused'; reason: VerificationRefusalReason; facts: readonly string[] };

export type CustomsVerdict = { verdict: 'verified' } | { verdict: 'refused'; check: VerificationCheck; reason: VerificationRefusalReason; facts: readonly string[] };

type VerificationCheckRun = (subject: CustomsSubject) => CheckVerdict;

const PASSED: CheckVerdict = { verdict: 'passed' };

const HOST_PATH_STYLE: GitPathStyle = { pathModule: path, foldsCase: false };

/** A protected name matches in any case on every host: a branch merged on Linux is later checked out where case folds. */
function protectedFormOf(gitPath: string): string {
  return gitPath.toLowerCase();
}

const REPOSITORY_ROOT_MARKER = '/';

const GIT_SEPARATOR = '/';

function projectPrefixOf(subject: Pick<CustomsSubject, 'projectScope'>): string {
  return subject.projectScope?.projectPrefix ?? '';
}

function entityHomesOf(subject: Pick<CustomsSubject, 'projectScope'>): readonly string[] {
  return subject.projectScope?.entityHomes ?? [];
}

/** Each entity home as a git path in its protected form, without its leading and trailing `/`; a home at the root is left out, as `''`. */
function protectedHomeFoldersOf(entityHomes: readonly string[]): string[] {
  return entityHomes.map((home) => protectedFormOf(EntityOwnershipUtil.homeFolderOf(home).replace(/^\/+/u, ''))).filter((home) => home !== '');
}

const AI_ATTRIBUTION_PATTERNS: readonly RegExp[] = [/^Co-Authored-By:\s*Claude/im, /Generated with/i];

const REPORT_SCHEMA_OF_ROLE: Readonly<Record<ReportingRole, JsonSchema>> = {
  'builder':       BUILDER_REPORT_SCHEMA,
  'reviewer':      REVIEWER_REPORT_SCHEMA,
  'airlock-agent': AIRLOCK_AGENT_REPORT_SCHEMA,
};

function refused(reason: VerificationRefusalReason, facts: readonly string[] = []): CheckVerdict {
  return { verdict: 'refused', reason, facts };
}

/** Every directory Customs reads is a job worktree, so git never walks above its parent into the main checkout. */
function worktreeGitRun(worktreePath: string, gitArguments: readonly string[], hookPolicy: GitHookPolicy = 'hooks-off'): GitRun | null {
  return GitProcess.run(worktreePath, gitArguments, hookPolicy, undefined, GitWorktrees.ceilingOf(worktreePath));
}

function worktreeCommitOf(worktreePath: string, revision: string): string | null {
  return GitProcess.resolvedCommitOf(worktreePath, revision, GitWorktrees.ceilingOf(worktreePath));
}

function gitLines(directory: string, gitArguments: readonly string[]): string[] | null {
  const run = worktreeGitRun(directory, gitArguments);
  if (!GitProcess.succeeded(run)) return null;
  return run.standardOutput.split('\n').filter((line) => line !== '');
}

/** The fields of a `-z` answer: git quotes no path there, so a name holding `"`, `\` or a control character keeps its own spelling. */
function gitFields(directory: string, gitArguments: readonly string[]): string[] | null {
  const run = worktreeGitRun(directory, gitArguments);
  if (!GitProcess.succeeded(run)) return null;
  return run.standardOutput.split('\0').filter((field) => field !== '');
}

type RangeSubject = Pick<CustomsSubject, 'worktreePath' | 'startCommit' | 'merge'>;

/** A merge job's own commits leave out every commit the target tip holds, so the target's history is never judged as the job's. */
function rangeArgumentsOf({ startCommit, merge }: RangeSubject): string[] {
  return merge === undefined ? [`${startCommit}..HEAD`] : [`${startCommit}..HEAD`, `^${merge.targetTip}`];
}

function rangeOf(subject: RangeSubject): string {
  return rangeArgumentsOf(subject).join(' ');
}

/** `git merge-tree --write-tree` exits 1 when the tree it wrote holds conflicts, which is still the automatic merge. */
const MERGE_TREE_CONFLICTED_EXIT_CODE = 1;

/** What the net diff is read from: git's automatic merge of branch and target when the job made that merge itself, so only its resolution counts. */
function netDiffBaseOf(subject: RangeSubject): string | null {
  const { worktreePath, startCommit, merge } = subject;
  if (merge === undefined) return startCommit;
  const mergesInRange = gitLines(worktreePath, ['rev-list', '--merges', ...rangeArgumentsOf(subject)]);
  if (mergesInRange === null) return null;
  if (mergesInRange.length === 0) return startCommit;
  const automaticMerge = worktreeGitRun(worktreePath, ['merge-tree', '--write-tree', '--no-messages', merge.branchTip, merge.targetTip]);
  if (!GitProcess.succeeded(automaticMerge) && automaticMerge?.exitCode !== MERGE_TREE_CONFLICTED_EXIT_CODE) return null;
  const automaticTree = automaticMerge?.standardOutput.split('\n')[0]?.trim() ?? '';
  return automaticTree === '' ? null : automaticTree;
}

/** Each commit's own paths, so a change a later commit undoes still counts, and the range's net diff, which holds a merge's resolution. */
function pathsChangedInRange(subject: RangeSubject): string[] | null {
  const netDiffBase       = netDiffBaseOf(subject);
  const pathsOfEachCommit = gitFields(subject.worktreePath, ['log', '--name-only', '--no-renames', '-z', '--format=', ...rangeArgumentsOf(subject), '--']);
  const pathsOfTheRange   = netDiffBase === null ? null : gitFields(subject.worktreePath, ['diff', '--name-only', '--no-renames', '-z', netDiffBase, 'HEAD', '--']);
  if (pathsOfEachCommit === null || pathsOfTheRange === null) return null;
  return [...new Set([...pathsOfEachCommit, ...pathsOfTheRange])];
}

function reportFieldOf(report: unknown, field: string): unknown {
  return typeof report === 'object' && report !== null && Object.hasOwn(report, field) ? (report as Record<string, unknown>)[field] : undefined;
}

function reportListOf(report: unknown, field: string): Record<string, unknown>[] {
  const value = reportFieldOf(report, field);
  return Array.isArray(value) ? value.filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null) : [];
}

function reportIsValidWithItsHead(subject: CustomsSubject): CheckVerdict {
  if (subject.role === 'pipeline-agent') return refused('report-invalid', ['no report']);
  const verdict = reportVerdictOf(REPORT_SCHEMA_OF_ROLE[subject.role], subject.report);
  if (verdict.verdict === 'invalid') return refused('report-invalid', verdict.problems);
  const headCommit = worktreeCommitOf(subject.worktreePath, 'HEAD');
  if (headCommit === null) return refused('git-failed', ['HEAD']);
  const reportedHead = String(reportFieldOf(subject.report, 'headCommit'));
  return reportedHead === headCommit ? PASSED : refused('head-not-reported', [reportedHead, headCommit]);
}

function headDescendsFromTheStart(subject: CustomsSubject): CheckVerdict {
  const run = worktreeGitRun(subject.worktreePath, ['merge-base', '--is-ancestor', subject.startCommit, 'HEAD']);
  return GitProcess.succeeded(run) ? PASSED : refused('history-rewritten', [subject.startCommit]);
}

/** A builder owes a commit only when it reports `built`; a reviewer and a resolution reviewer never do. */
function aCommitSinceTheStart(subject: CustomsSubject): CheckVerdict {
  if (subject.role === 'builder' && reportFieldOf(subject.report, 'outcome') !== 'built') return PASSED;
  const measured = { ...subject, startCommit: subject.workStartCommit ?? subject.startCommit };
  const commits = gitLines(subject.worktreePath, ['rev-list', ...rangeArgumentsOf(measured)]);
  if (commits === null) return refused('git-failed', [rangeOf(measured)]);
  return commits.length > 0 ? PASSED : refused('no-commit-since-start', [measured.startCommit]);
}

/** The first build job of the unbroken run of failed attempts right before this build job on its ticket; `null` after any other ending. */
export function retriedFailedBuildJobIdOf(logRecords: readonly LogRecord[], jobId: string): string | null {
  const buildLaunches = logRecords.flatMap((record) => (record.kind === 'job-launched' && record.fields.kind === 'build' ? [record] : []));
  const ownLaunch = buildLaunches.find((launch) => launch.jobId === jobId);
  if (ownLaunch === undefined) return null;
  const ticketKey = [...ownLaunch.fields.ticketIds].sort().join(',');
  const failedJobIds = new Set(logRecords.flatMap((record) => (record.kind === 'job-ended' && record.fields.outcome === 'failed' ? [record.jobId] : [])));
  const earlier = buildLaunches.slice(0, buildLaunches.indexOf(ownLaunch)).filter((launch) => [...launch.fields.ticketIds].sort().join(',') === ticketKey);
  let retried: string | null = null;
  for (let i = earlier.length - 1; i >= 0 && failedJobIds.has(earlier[i]?.jobId ?? ''); i -= 1) retried = earlier[i]?.jobId ?? null;
  return retried;
}

function worktreeIsClean(subject: CustomsSubject): CheckVerdict {
  const run = worktreeGitRun(subject.worktreePath, ['status', '--porcelain=v1', '--untracked-files=all']);
  if (!GitProcess.succeeded(run)) return refused('git-failed', ['status']);
  const paths = run.standardOutput.split('\n').filter((line) => line !== '');
  return paths.length === 0 ? PASSED : refused('worktree-dirty', paths);
}

/**
 * The git paths among `gitPaths` in a data folder: at the root for a tracker at the root, as always, and directly in each of `entityHomes`
 * on a pipeline with entities; at any depth for a project tracker, whose own data folder and every sibling's lie below the root.
 */
export function dataFolderPathsAmong(gitPaths: readonly string[], projectPrefix: string, entityHomes: readonly string[] = []): string[] {
  const dataFolder = protectedFormOf(PRODUCT_NAMES.DATA_FOLDER);
  const homeDataFolders = protectedHomeFoldersOf(entityHomes).map((home) => `${home}${GIT_SEPARATOR}${dataFolder}${GIT_SEPARATOR}`);
  return gitPaths.filter((gitPath) => {
    const protectedForm = protectedFormOf(gitPath);
    const segments = protectedForm.split(GIT_SEPARATOR);
    if (projectPrefix !== '') return segments.includes(dataFolder);
    return segments[0] === dataFolder || homeDataFolders.some((homeDataFolder) => protectedForm.startsWith(homeDataFolder));
  });
}

function dataFolderUntouched(subject: CustomsSubject): CheckVerdict {
  const paths = pathsChangedInRange(subject);
  if (paths === null) return refused('git-failed', [rangeOf(subject)]);
  const touched = dataFolderPathsAmong(paths, projectPrefixOf(subject), entityHomesOf(subject));
  return touched.length === 0 ? PASSED : refused('data-folder-touched', touched);
}

function ticketBodyUnchanged(subject: CustomsSubject): CheckVerdict {
  const bodyHash = TicketBodyHashUtil.bodyHashOf(subject.ticketBody);
  return bodyHash === subject.bodyHashAtLaunch ? PASSED : refused('ticket-body-changed', [subject.bodyHashAtLaunch, bodyHash]);
}

function noAiAttributionInRange(subject: CustomsSubject): CheckVerdict {
  const commits = gitLines(subject.worktreePath, ['rev-list', ...rangeArgumentsOf(subject)]);
  if (commits === null) return refused('git-failed', [rangeOf(subject)]);
  const attributed = commits.filter((commit) => {
    const message = worktreeGitRun(subject.worktreePath, ['log', '-1', '--format=%B', commit]);
    return GitProcess.succeeded(message) && AI_ATTRIBUTION_PATTERNS.some((pattern) => pattern.test(message.standardOutput));
  });
  return attributed.length === 0 ? PASSED : refused('ai-attribution-in-range', attributed);
}

/** A builder accounts for each item with evidence or a waiver proposal; a reviewer with a claim. An item the Acceptance waives needs neither. */
function everyAcceptanceItemAccountedFor(subject: CustomsSubject): CheckVerdict {
  const labels  = TicketAcceptanceUtil.acceptanceItemsOf(subject.ticketBody).filter(({ waivedReason }) => waivedReason === null).map(({ label }) => label);
  const covered = subject.role === 'reviewer'
    ? reportListOf(subject.report, 'claims').map((claim) => String(claim['item']).trim())
    : reportListOf(subject.report, 'acceptance')
      .filter((entry) => entry['state'] === 'waiver-proposed' || String(entry['evidence'] ?? '').trim() !== '')
      .map((entry) => String(entry['item']).trim());
  const missing = labels.filter((label) => !covered.includes(label));
  return missing.length === 0 ? PASSED : refused('acceptance-without-evidence', missing);
}

function fixedFindingsNameCommitsInRange(subject: CustomsSubject): CheckVerdict {
  const commits = gitLines(subject.worktreePath, ['rev-list', ...rangeArgumentsOf(subject)]);
  if (commits === null) return refused('git-failed', [rangeOf(subject)]);
  const outside = reportListOf(subject.report, 'findings')
    .filter((finding) => finding['outcome'] === 'fixed')
    .map((finding) => String(finding['commit']))
    .filter((commit) => !commits.includes(commit));
  return outside.length === 0 ? PASSED : refused('fixed-finding-outside-range', outside);
}

/** The merge commit is the first merge in range, or the start itself for a job that began from the merged commit. */
function mergeCommitOf(subject: CustomsSubject): string | null {
  const merges = gitLines(subject.worktreePath, ['rev-list', '--merges', '--reverse', ...rangeArgumentsOf(subject)]);
  return merges?.[0] ?? subject.startCommit;
}

/**
 * The repository's own `core.whitespace` with `cr-at-eol` added: a CR before a line end is the file's own line ending in a repository holding
 * CRLF blobs, never trailing whitespace, and a `-c` value replaces the configured one rather than adding to it.
 */
function whitespaceRuleOf(worktreePath: string): string {
  const configured = worktreeGitRun(worktreePath, ['config', '--get', 'core.whitespace']);
  const ownRule = GitProcess.succeeded(configured) ? configured.standardOutput.trim() : '';
  return ownRule === '' ? 'cr-at-eol' : `${ownRule},cr-at-eol`;
}

function mergeIsResolved(subject: CustomsSubject): CheckVerdict {
  const { merge, worktreePath } = subject;
  if (merge === undefined) return refused('merge-unresolved', ['no merge']);
  const unmerged = gitLines(worktreePath, ['ls-files', '-u']);
  if (unmerged === null || unmerged.length > 0) return refused('merge-unresolved', unmerged ?? ['ls-files']);
  const mergeCommit = mergeCommitOf(subject);
  const whitespaceRule = merge.conflictedFiles.length > 0 ? whitespaceRuleOf(worktreePath) : '';
  const unclean = GitArgumentsUtil.pathspecChunksOf(merge.conflictedFiles, GIT_PATHSPEC_ARGUMENT_CHARACTERS).some((chunk) => {
    const markersAndWhitespace = worktreeGitRun(worktreePath, ['-c', `core.whitespace=${whitespaceRule}`, 'diff', '--check', merge.branchTip, 'HEAD', '--', ...chunk]);
    return !GitProcess.succeeded(markersAndWhitespace);
  });
  if (unclean) return refused('merge-unresolved', [...merge.conflictedFiles]);
  const parents = mergeCommit === null ? null : gitLines(worktreePath, ['rev-list', '--parents', '-n', '1', mergeCommit])?.[0]?.split(' ').slice(1);
  const expected = [merge.branchTip, merge.targetTip];
  return JSON.stringify(parents) === JSON.stringify(expected) ? PASSED : refused('merge-unresolved', parents ?? []);
}

/**
 * A board's pattern as git reads a pathspec glob: `*` and `?` stay inside one folder, `**` crosses any number of them, none included, a trailing
 * `/` takes a folder's whole content, and a pattern without an inner `/` matches its name at any depth.
 */
export function definitionFilePatternExpressionOf(pattern: string): RegExp {
  const namesAFolder = pattern.endsWith('/');
  const body         = pattern.replace(/\/+$/, '');
  const anchored     = body.includes('/');
  const translated   = body.replace(/^\//, '').replace(/\*\*\/|\*\*|\*|\?|[.+^${}()|[\]\\]/g, (token) => {
    if (token === '**/') return '(?:.*/)?';
    if (token === '**') return '.*';
    if (token === '*') return '[^/]*';
    if (token === '?') return '[^/]';
    return `\\${token}`;
  });
  return new RegExp(`${anchored ? '^' : '(^|/)'}${translated}${namesAFolder ? '/' : '$'}`);
}

/**
 * Whether a repository path is one a board's pattern names. A pattern leading with `/` is read from the repository root and any other from
 * the project's folder, so `src/**` and a bare `eslint.config.js` never name a sibling project's file; with the prefix `''` both read
 * from the root, as a pattern always has.
 */
export function definitionFileMatcherOf(pattern: string, projectPrefix: string): (repositoryPath: string) => boolean {
  const expression = definitionFilePatternExpressionOf(pattern);
  if (pattern.startsWith(REPOSITORY_ROOT_MARKER)) return (repositoryPath) => expression.test(repositoryPath);
  return (repositoryPath) => {
    const projectPath = ProjectPathsUtil.toProjectPath(projectPrefix, repositoryPath);
    return !projectPath.startsWith(REPOSITORY_ROOT_MARKER) && expression.test(projectPath);
  };
}

/**
 * The paths the branch changed itself: those of its own commits, which `target` does not hold, and what HEAD changes against the newest
 * commit of `target` that the branch holds. A merge commit names no paths of its own here, so only what its tree changes against `target`
 * counts.
 */
function pathsTheBranchChangedPast(subject: RangeSubject, target: string): string[] | null {
  const base = worktreeGitRun(subject.worktreePath, ['merge-base', target, 'HEAD']);
  if (!GitProcess.succeeded(base)) return null;
  const pathsOfOwnCommits = gitLines(subject.worktreePath, ['log', '--name-only', '--no-renames', '--format=', ...rangeArgumentsOf(subject), `^${target}`, '--']);
  const pathsAgainstTarget = gitLines(subject.worktreePath, ['diff', '--name-only', '--no-renames', base.standardOutput.trim(), 'HEAD', '--']);
  if (pathsOfOwnCommits === null || pathsAgainstTarget === null) return null;
  return [...new Set([...pathsOfOwnCommits, ...pathsAgainstTarget])];
}

/** The instruction files of `changed` that the branch changed itself; all of them when the subject names no target. */
function instructionFilesChangedByTheBranch(subject: CustomsSubject, changed: readonly string[]): readonly string[] | null {
  if (changed.length === 0 || subject.target === undefined) return changed;
  const ownPaths = pathsTheBranchChangedPast(subject, subject.target);
  if (ownPaths === null) return null;
  const ownProtectedForms = new Set(ownPaths.map(protectedFormOf));
  return changed.filter((gitPath) => ownProtectedForms.has(protectedFormOf(gitPath)));
}

/** With no gate naming a `definedBy` the board names no definition files, so nothing refuses. */
/** A ticket names a file as the project's paths do, so `src/x.ts` names the project's file and `/bun.lock` the root's. */
function checksDefinitionUnchanged(subject: CustomsSubject): CheckVerdict {
  const projectPrefix = projectPrefixOf(subject);
  const matchers = (subject.gates ?? []).flatMap((gate) => gate.definedBy ?? []).map((pattern) => definitionFileMatcherOf(pattern, projectPrefix));
  const instructionFiles = subject.instructionFiles ?? [];
  if (matchers.length === 0 && instructionFiles.length === 0) return PASSED;
  const paths = pathsChangedInRange(subject);
  if (paths === null) return refused('git-failed', [rangeOf(subject)]);
  const unnamed = paths.filter((path) => !subject.ticketBody.includes(ProjectPathsUtil.toProjectPath(projectPrefix, path)));
  const changedDefinitions = unnamed.filter((path) => matchers.some((matches) => matches(path)));
  if (changedDefinitions.length > 0) return refused('checks-definition-changed', changedDefinitions);
  const protectedInstructionFiles = instructionFiles.map(protectedFormOf);
  const changedInstructions = instructionFilesChangedByTheBranch(
    subject,
    unnamed.filter((gitPath) => protectedInstructionFiles.includes(protectedFormOf(gitPath))),
  );
  if (changedInstructions === null) return refused('git-failed', [subject.target ?? rangeOf(subject)]);
  return changedInstructions.length === 0 ? PASSED : refused('instruction-file-changed', changedInstructions);
}

function reachEntryOf(reachPath: string): string {
  return reachPath.replace(/^\/+/, '').replace(/\/+$/, '');
}

/** The git paths among `gitPaths` outside the project's folder and every reach entry, a file or a folder; none for a tracker at the root. */
export function pathsOutsideHomeAndReachOf(gitPaths: readonly string[], projectScope: ProjectScope): string[] {
  const { projectPrefix, reach } = projectScope;
  if (projectPrefix === '') return [];
  const allowedPaths = [projectPrefix, ...reach.map(reachEntryOf)];
  return gitPaths.filter((gitPath) => !allowedPaths.some((allowed) => gitPath === allowed || gitPath.startsWith(`${allowed}${GIT_SEPARATOR}`)));
}

/** The length of the deepest of `folders` that holds `repositoryPath`, or the path itself; `-1` when none does. */
function deepestFolderHolding(folders: readonly string[], repositoryPath: string): number {
  return folders.map(EntityOwnershipUtil.homeFolderOf)
    .filter((folder) => repositoryPath === folder || repositoryPath.startsWith(`${folder}${GIT_SEPARATOR}`))
    .reduce((deepest, folder) => Math.max(deepest, folder.length), -1);
}

/**
 * The git paths among `gitPaths` that a job of an entity may not change: outside its `reach`, and outside its homes or held by a deeper home
 * of another entity.
 */
export function pathsOutsideWritableFoldersOf(gitPaths: readonly string[], writableFolders: WritableFolders): string[] {
  return gitPaths.filter((gitPath) => {
    const repositoryPath = `${REPOSITORY_ROOT_MARKER}${gitPath}`;
    if (deepestFolderHolding(writableFolders.reach, repositoryPath) >= 0) return false;
    const ownHomeDepth = deepestFolderHolding(writableFolders.homes, repositoryPath);
    return ownHomeDepth < 0 || deepestFolderHolding(writableFolders.otherHomes, repositoryPath) > ownHomeDepth;
  });
}

/**
 * Judged on what the branch changed itself past its target, so a merge of the main line bringing a sibling's landing in never counts. A
 * tracker at the root asks git nothing here, unless the job is a job of an entity.
 */
function changesStayInHomeAndReach(subject: CustomsSubject): CheckVerdict {
  const { projectScope } = subject;
  if (projectScope === undefined) return PASSED;
  const { writableFolders } = projectScope;
  if (writableFolders === undefined && projectScope.projectPrefix === '') return PASSED;
  const paths = subject.target === undefined ? pathsChangedInRange(subject) : pathsTheBranchChangedPast(subject, subject.target);
  if (paths === null) return refused('git-failed', [subject.target ?? rangeOf(subject)]);
  const outside = writableFolders === undefined ? pathsOutsideHomeAndReachOf(paths, projectScope) : pathsOutsideWritableFoldersOf(paths, writableFolders);
  return outside.length === 0 ? PASSED : refused('changed-outside-home-and-reach', outside);
}

/** Every gate but an `overseerOnly` one must be claimed on HEAD itself; a claim on any other commit is stale, and an unknown name is ignored. */
function everyAgentGateClaimedOnHead(subject: CustomsSubject): CheckVerdict {
  const headCommit = worktreeCommitOf(subject.worktreePath, 'HEAD');
  if (headCommit === null) return refused('git-failed', ['HEAD']);
  const claimedOnHead = reportListOf(subject.report, 'gates').filter((claim) => claim['commit'] === headCommit).map((claim) => String(claim['name']));
  const unclaimed = (subject.gates ?? []).filter((gate) => gate.overseerOnly !== true && !claimedOnHead.includes(gate.name)).map((gate) => gate.name);
  return unclaimed.length === 0 ? PASSED : refused('gate-unclaimed', unclaimed);
}

function ticketNumberOf(ticketReference: string): number {
  return Number(ticketReference.replace(/^#/, ''));
}

/** The ticket a relayed request filed: the nearest `ticket-filed` this job logged before the request's `hatch-applied`, in the same application. */
export function ticketIdFiledByRequest(records: readonly LogRecord[], jobId: string, requestId: string): string | null {
  const appliedIndex = records.findIndex((record) => record.kind === 'hatch-applied' && record.jobId === jobId && record.fields.requestId === requestId);
  for (let i = appliedIndex - 1; i >= 0; i -= 1) {
    const record = records[i];
    if (record === undefined || record.kind === 'hatch-applied') return null;
    if (record.kind === 'ticket-filed' && record.fields.filedByJob === jobId) return record.ticketId;
  }
  return null;
}

/** V12 reads the filing record, never the ticket now: the filing's own close, or User, may have moved it since. */
function filingIsThisJobsLowFinding(records: readonly LogRecord[], jobId: string, ticketId: string): boolean {
  return records.some((record) => record.kind === 'ticket-filed'
    && ticketNumberOf(record.ticketId) === ticketNumberOf(ticketId)
    && record.fields.filedByJob === jobId
    && record.fields.status === 'draft'
    && record.fields.priority === 'low');
}

/** A reviewer's filed findings, each a draft low ticket this job filed through its Hatch. */
function filedFindingsWereFiledByThisJob(subject: CustomsSubject): CheckVerdict {
  const records = subject.logRecords ?? [];
  const jobId = subject.jobId ?? '';
  const filed = reportListOf(subject.report, 'findings').filter((finding) => finding['outcome'] === 'filed');
  const unproven = filed.flatMap((finding) => {
    const namedTicketId = typeof finding['filedTicketId'] === 'string' ? finding['filedTicketId'] : null;
    const requestId = typeof finding['hatchRequestId'] === 'string' ? finding['hatchRequestId'] : null;
    const ticketId = namedTicketId ?? (requestId === null ? null : ticketIdFiledByRequest(records, jobId, requestId));
    if (ticketId !== null && filingIsThisJobsLowFinding(records, jobId, ticketId)) return [];
    return [namedTicketId ?? requestId ?? 'unnamed'];
  });
  return unproven.length === 0 ? PASSED : refused('finding-not-filed-by-job', unproven);
}

/** Matched against a protected form, so lower case only. */
const AGENT_CONFIG_PATTERNS_AT_THE_ROOT: readonly RegExp[] = [/^\.claude\//, /^\.mcp\.json$/];

/** A project tracker's sessions start below the root, where Claude Code also reads the project's own configuration. */
const AGENT_CONFIG_PATTERNS_AT_ANY_DEPTH: readonly RegExp[] = [/(^|\/)\.claude\//, /(^|\/)\.mcp\.json$/];

const DEFAULT_HOOKS_FOLDER = 'hooks';

const GIT_FOLDER_NAME = '.git';

/** `core.hooksPath` read from git, relative paths against the worktree's root; `.git/hooks` of the common folder otherwise. */
function hooksFolderOf(worktreePath: string): string | null {
  // Read with the repository's own setting in force: the hooks-off override would answer its own path, and reading config runs no hook.
  const configured = worktreeGitRun(worktreePath, ['config', '--get', 'core.hooksPath'], 'repository-hooks');
  if (GitProcess.succeeded(configured) && configured.standardOutput.trim() !== '') return resolve(worktreePath, configured.standardOutput.trim());
  const commonFolder = worktreeGitRun(worktreePath, ['rev-parse', '--path-format=absolute', '--git-common-dir']);
  return GitProcess.succeeded(commonFolder) ? join(commonFolder.standardOutput.trim(), DEFAULT_HOOKS_FOLDER) : null;
}

/** The hooks folder as git spells a path inside the worktree, `null` when it lies outside it, where only the launch digest can tell a change. */
function hooksFolderInsideWorktree(style: GitPathStyle, worktreePath: string): string | null {
  const hooksFolder = hooksFolderOf(worktreePath);
  const gitPath = hooksFolder === null ? null : GitPaths.relativeInsideOf(style, worktreePath, hooksFolder);
  // git lists no path under the main checkout's `.git`, so a hooks folder there is judged by the digest alone.
  return gitPath === null || protectedFormOf(gitPath).split('/')[0] === GIT_FOLDER_NAME ? null : gitPath;
}

/** Any of the owner, group and other execute bits: git runs a hook only when it is executable. */
const EXECUTABLE_MODE_BITS = 0o111;

type HooksFolderReading = { verdict: 'read'; digest: string | null } | { verdict: 'unreadable' };

/**
 * The hooks folder as one digest of each entry's path and kind: a symbolic link by its target, which git follows to run it, and a file by
 * its content and whether it is executable. `null` when the folder is missing; an entry that cannot be read, or that went between the list
 * and the read, makes the folder unreadable, which no snapshot matches.
 */
function hooksFolderReadingOf(worktreePath: string): HooksFolderReading {
  const hooksFolder = hooksFolderOf(worktreePath);
  try {
    // A hooks path that is no folder, such as the hooks-off path below the git program, holds no hook.
    if (hooksFolder === null || !existsSync(hooksFolder) || !statSync(hooksFolder).isDirectory()) return { verdict: 'read', digest: null };
    const digest = createHash('sha256');
    for (const entry of readdirSync(hooksFolder, { recursive: true, withFileTypes: true })) {
      const entryPath = join(entry.parentPath, entry.name);
      const name = relative(hooksFolder, entryPath);
      if (entry.isSymbolicLink()) digest.update(`link\0${name}\0${readlinkSync(entryPath)}\0`);
      if (!entry.isFile()) continue;
      const kind = (lstatSync(entryPath).mode & EXECUTABLE_MODE_BITS) === 0 ? 'file' : 'executable';
      digest.update(`${kind}\0${name}\0`).update(readFileSync(entryPath)).update('\0');
    }
    return { verdict: 'read', digest: digest.digest('hex') };
  } catch {
    return { verdict: 'unreadable' };
  }
}

/** The agent configuration directly in an entity home, as the root's patterns name it there; lower case, matched against a protected form. */
function agentConfigInAnEntityHome(protectedForm: string, protectedHomeFolders: readonly string[]): boolean {
  return protectedHomeFolders.some((home) => {
    const inHome = protectedForm.startsWith(`${home}${GIT_SEPARATOR}`) ? protectedForm.slice(home.length + 1) : null;
    return inHome !== null && AGENT_CONFIG_PATTERNS_AT_THE_ROOT.some((pattern) => pattern.test(inHome));
  });
}

/**
 * The git paths among `gitPaths` under `.claude/`, `.mcp.json` or the hooks folder, given as git spells it inside the worktree; any case
 * matches. The first two are protected at the root for a tracker at the root, as always, and also in each of `entityHomes` on a pipeline
 * with entities; at any depth for a project tracker.
 */
export function agentConfigPathsAmong(gitPaths: readonly string[], hooksFolderGitPath: string | null, projectPrefix = '', entityHomes: readonly string[] = []): string[] {
  const hooksFolder = hooksFolderGitPath === null ? null : protectedFormOf(hooksFolderGitPath);
  const patterns = projectPrefix === '' ? AGENT_CONFIG_PATTERNS_AT_THE_ROOT : AGENT_CONFIG_PATTERNS_AT_ANY_DEPTH;
  const protectedHomeFolders = projectPrefix === '' ? protectedHomeFoldersOf(entityHomes) : [];
  return gitPaths.filter((gitPath) => {
    const protectedForm = protectedFormOf(gitPath);
    if (patterns.some((pattern) => pattern.test(protectedForm)) || agentConfigInAnEntityHome(protectedForm, protectedHomeFolders)) return true;
    return hooksFolder !== null && (protectedForm === hooksFolder || protectedForm.startsWith(`${hooksFolder}/`));
  });
}

/** Every path a commit since `sinceCommit` or the worktree itself changes under `.claude/`, `.mcp.json` or an in-tree hooks folder. */
function agentConfigPathsTouched(
  style: GitPathStyle,
  worktreePath: string,
  since: { commit: string; projectPrefix: string; entityHomes: readonly string[]; merge?: MergeUnderVerification | undefined }
): string[] | null {
  const paths = pathsChangedInRange({ worktreePath, startCommit: since.commit, ...(since.merge === undefined ? {} : { merge: since.merge }) });
  const status = gitFields(worktreePath, ['status', '--porcelain=v1', '-z', '--untracked-files=all', '--no-renames']);
  if (paths === null || status === null) return null;
  const worktreePaths = status.map((entry) => entry.slice('XY '.length));
  const hooksFolder = hooksFolderInsideWorktree(style, worktreePath);
  return agentConfigPathsAmong([...new Set([...paths, ...worktreePaths])], hooksFolder, since.projectPrefix, since.entityHomes).sort();
}

function agentConfigUntouched(subject: CustomsSubject): CheckVerdict {
  const style = subject.pathStyle ?? HOST_PATH_STYLE;
  const touched = agentConfigPathsTouched(style, subject.worktreePath, {
    commit: subject.startCommit, projectPrefix: projectPrefixOf(subject), entityHomes: entityHomesOf(subject), merge: subject.merge
  });
  if (touched === null) return refused('git-failed', [rangeOf(subject)]);
  const hooksFolderReading = subject.launchSnapshot === undefined || hooksFolderInsideWorktree(style, subject.worktreePath) !== null
    ? null
    : hooksFolderReadingOf(subject.worktreePath);
  const hooksFolderChanged = hooksFolderReading !== null
    && (hooksFolderReading.verdict === 'unreadable' || hooksFolderReading.digest !== subject.launchSnapshot?.hooksFolderDigest);
  const facts = [...touched, ...(hooksFolderChanged ? [hooksFolderOf(subject.worktreePath) ?? DEFAULT_HOOKS_FOLDER] : [])];
  return facts.length === 0 ? PASSED : refused('branch-touches-agent-config', facts);
}

/** Each ref's commit and each detached worktree's HEAD, read from the repository the worktree belongs to. */
function refsOf(worktreePath: string): Record<string, string> | null {
  const refLines = gitLines(worktreePath, ['for-each-ref', '--format=%(refname) %(objectname)']);
  const worktreeLines = gitLines(worktreePath, ['worktree', 'list', '--porcelain']);
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

/** `null` when git cannot list the refs or the hooks folder cannot be read, so no snapshot is taken that V13 could not hold. */
export function launchSnapshotOf(worktreePath: string): LaunchSnapshot | null {
  const refs = refsOf(worktreePath);
  const hooksFolderReading = hooksFolderReadingOf(worktreePath);
  if (refs === null || hooksFolderReading.verdict === 'unreadable') return null;
  return { refs, hooksFolderDigest: hooksFolderReading.digest };
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
export function foreignRefsMovedOf(
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
  const moved = [...new Set([...launchRefs.keys(), ...nowRefs.keys()])].filter((ref) => {
    if (exempt.has(ref)) return false;
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
  if (launchSnapshot === undefined || refMovesAllowed === undefined) return refused('foreign-ref-moved', ['no launch snapshot']);
  const nowRefs = refsOf(subject.worktreePath);
  if (nowRefs === null) return refused('git-failed', ['for-each-ref']);
  const moved = foreignRefsMovedOf(subject.pathStyle ?? HOST_PATH_STYLE, { launchRefs: launchSnapshot.refs, nowRefs }, refMovesAllowed, subject.worktreePath);
  return moved.length === 0 ? PASSED : refused('foreign-ref-moved', moved);
}

/** `null` for a tracker whose branches keep their bare names: it watches every ref, as it always has. */
export function watchedRefsOf(branchNames: BranchNames, mainLine: string, worktreesRoot: string): WatchedRefs | null {
  return branchNames.namespacePrefix === '' ? null : { mainLine, namespacePrefix: branchNames.namespacePrefix, worktreesRoot };
}

/**
 * What a tracker sharing its repository adds to V14: the journal's landings, none for a tracker with no journal or an unreadable one, and
 * the refs it watches.
 */
export function sharedRepositoryRefsOf(landingFiles: RepositoryLandingFiles | null, watchedRefs: WatchedRefs | null): SharedRepositoryRefs {
  const journal = landingFiles === null ? null : RepositoryLandings.readLandingJournal(landingFiles);
  return { journaledLandings: journal?.verdict === 'readable' ? journal.landings : [], watchedRefs };
}

/**
 * V14's exemptions from the log: each landing on its job's target at its commit, what a main-line landing deletes, every refresh's and
 * constitution commit's worktree, and the ticket branches of the jobs ending after the verified job's launch. A tracker sharing its
 * repository adds each journaled landing, a sibling's among them, and the refs it watches.
 */
export function refMovesAllowedOf(
  logRecords: readonly LogRecord[],
  naming: OverseerRefNaming,
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
    ...(sharedRepository.watchedRefs === null ? {} : { watchedRefs: sharedRepository.watchedRefs }),
  };
}

/** The pipeline agent reads a snapshot and changes nothing in it: a commit, even one on top of the start, moved its HEAD. */
function headUnmoved(subject: CustomsSubject): CheckVerdict {
  const headCommit = worktreeCommitOf(subject.worktreePath, 'HEAD');
  if (headCommit === null) return refused('git-failed', ['HEAD']);
  return headCommit === subject.startCommit ? PASSED : refused('head-moved', [subject.startCommit, headCommit]);
}

export const CUSTOMS_CHECKS: Readonly<Record<VerificationCheck, VerificationCheckRun>> = {
  V1:  reportIsValidWithItsHead,
  V2:  headDescendsFromTheStart,
  V3:  aCommitSinceTheStart,
  V4:  worktreeIsClean,
  V5:  dataFolderUntouched,
  V6:  ticketBodyUnchanged,
  V7:  noAiAttributionInRange,
  V8:  everyAcceptanceItemAccountedFor,
  V9:  fixedFindingsNameCommitsInRange,
  V10: mergeIsResolved,
  V11: checksDefinitionUnchanged,
  V12: filedFindingsWereFiledByThisJob,
  V13: agentConfigUntouched,
  V14: onlyOwnRefsMoved,
  V15: everyAgentGateClaimedOnHead,
  V16: headUnmoved,
  V17: changesStayInHomeAndReach,
};

/** The design's table, column by column, in check order. */
export const CHECKS_OF_ROLE: Readonly<Record<VerifiedRole, readonly VerificationCheck[]>> = {
  'builder':        ['V1', 'V2', 'V3', 'V4', 'V5', 'V6', 'V7', 'V8', 'V11', 'V17', 'V13', 'V14', 'V15'],
  'reviewer':       ['V1', 'V2', 'V4', 'V5', 'V6', 'V7', 'V8', 'V9', 'V11', 'V17', 'V12', 'V13', 'V14'],
  'airlock-agent':  ['V1', 'V2', 'V3', 'V4', 'V5', 'V6', 'V7', 'V10', 'V11', 'V17', 'V13', 'V14'],
  'pipeline-agent': ['V16', 'V4', 'V5', 'V13', 'V14'],
};

/**
 * V13 before a launch on the branch, resumes included: the branch's own commits past its target, and the worktree as it stands. On a
 * pipeline with entities, `entityHomes` names every entity home.
 */
export function agentConfigTouchedBeforeLaunch(
  worktreePath: string, target: string, style: GitPathStyle = HOST_PATH_STYLE, projectPrefix = '', entityHomes: readonly string[] = []
): CheckVerdict {
  const base = worktreeGitRun(worktreePath, ['merge-base', target, 'HEAD']);
  if (!GitProcess.succeeded(base)) return refused('git-failed', [target]);
  const touched = agentConfigPathsTouched(style, worktreePath, { commit: base.standardOutput.trim(), projectPrefix, entityHomes });
  if (touched === null) return refused('git-failed', [target]);
  return touched.length === 0 ? PASSED : refused('branch-touches-agent-config', touched);
}

/** The first check of the role's column that refuses, so the Overseer acts on one reason. */
export function clearCustoms(subject: CustomsSubject): CustomsVerdict {
  for (const check of CHECKS_OF_ROLE[subject.role]) {
    const verdict = CUSTOMS_CHECKS[check](subject);
    if (verdict.verdict === 'refused') return {
      verdict: 'refused', check, reason: verdict.reason, facts: verdict.facts
    };
  }
  return { verdict: 'verified' };
}
