/**
 * What a test run leaves behind, found after its last test by the preload `src/testing/TestRunReport.ts`: a process still working in the
 * run's folders, an entry in the run's own temp folder or straight in the shared scratch root, and a new worktree, branch or changed file
 * in the repository under test. Only what is known to be this run's counts, since other runs on the machine share every folder named here.
 */
import { existsSync, readdirSync } from 'node:fs';
import { join }                    from 'node:path';

import {
  describedProcess,
  type FolderProcess,
  processesReachingInto,
  processIsRunning,
  stopProcesses
}                                                   from './ProcessesInFolder.ts';
import { SHARED_SCRATCH_ROOT } from './ScratchWorkspace.ts';
import { canonicalPathOf }     from './TrackerIsolation.ts';

/** The one shared-root entry a run may add: the `claude` trap every run keeps (`src/testing/ClaudeLaunchTrap.ts`). */
const LASTING_SCRATCH_ROOT_ENTRIES = ['claude-launch-trap'];
const RUN_FOLDER_PREFIX            = 'run-';
/** Node's compile cache, which `tsc` and `eslint` keep in the temp folder on purpose for every later start; the run folder takes it. */
const TEMPORARY_FOLDER_CACHES      = ['node-compile-cache'];
const TEMPORARY_ROOTS              = ['/tmp', '/var/tmp'];

/** A teardown may still be stopping a child when the last test ends; the check looks again before it calls the child a leak. */
const PROCESS_SETTLE_POLLS             = 40;
const PROCESS_SETTLE_POLL_MILLISECONDS = 50;

interface RepositoryState {
  readonly directory:     string;
  readonly worktreeLines: readonly string[];
  readonly worktreePaths: readonly string[];
  readonly branchNames:   readonly string[];
  readonly statusLines:   readonly string[];
}

export interface TestRunBaseline {
  readonly scratchRootEntries: ReadonlySet<string>;
  readonly repository:         RepositoryState | null;
  readonly temporaryRoots:     readonly string[];
}

export interface RunFolders {
  readonly scratchFolder:   string | null;
  readonly temporaryFolder: string | null;
}

function gitLinesIn(directory: string | null, gitArguments: readonly string[]): string[] | null {
  if (Bun.which('git') === null) return null;
  const finished = Bun.spawnSync(['git', ...gitArguments], { ...(directory === null ? {} : { cwd: directory }), stdout: 'pipe', stderr: 'ignore' });
  if (finished.exitCode !== 0) return null;
  return finished.stdout.toString().split('\n').filter((line) => line !== '');
}

function repositoryStateOf(directory: string): RepositoryState | null {
  const worktreeLines = gitLinesIn(directory, ['worktree', 'list', '--porcelain']);
  const branchNames   = gitLinesIn(directory, ['for-each-ref', '--format=%(refname:short)', 'refs/heads']);
  const statusLines   = gitLinesIn(directory, ['status', '--porcelain', '--untracked-files=all']);
  if (worktreeLines === null || branchNames === null || statusLines === null) return null;
  const worktreePaths = worktreeLines.filter((line) => line.startsWith('worktree ')).map((line) => line.slice('worktree '.length));
  return {
    directory, worktreeLines, worktreePaths, branchNames, statusLines
  };
}

/** The repository the run was started in, through git itself, so a run outside any repository checks no git state. */
function repositoryUnderTest(): RepositoryState | null {
  const topLevel = gitLinesIn(null, ['rev-parse', '--show-toplevel'])?.[0];
  return topLevel === undefined ? null : repositoryStateOf(topLevel);
}

function directoryEntries(directory: string): string[] {
  return existsSync(directory) ? readdirSync(directory) : [];
}

/** Taken when the preload loads, before any spec runs; `temporaryFolderBeforeTheRun` is the machine's, before the run moved `TMPDIR`. */
export function takeTestRunBaseline(temporaryFolderBeforeTheRun: string): TestRunBaseline {
  return {
    scratchRootEntries: new Set(directoryEntries(SHARED_SCRATCH_ROOT)),
    repository:         repositoryUnderTest(),
    temporaryRoots:     [...new Set([SHARED_SCRATCH_ROOT, temporaryFolderBeforeTheRun, ...TEMPORARY_ROOTS].map(canonicalPathOf))],
  };
}

function processesInTheRunFolders(folders: RunFolders): FolderProcess[] {
  const reaching = [folders.scratchFolder, folders.temporaryFolder].flatMap((folder) => (folder === null ? [] : processesReachingInto(folder)));
  return [...new Map(reaching.map((leftover) => [leftover.processId, leftover])).values()];
}

/** Named, then stopped, so a failed run does not leave them running too. Before the run folders go, since a process is found by them. */
export async function processLeaksOf(folders: RunFolders): Promise<string[]> {
  let leftovers = processesInTheRunFolders(folders);
  for (let poll = 0; poll < PROCESS_SETTLE_POLLS && leftovers.length > 0; poll += 1) {
    await Bun.sleep(PROCESS_SETTLE_POLL_MILLISECONDS);
    leftovers = leftovers.filter((leftover) => processIsRunning(leftover.processId));
  }
  await stopProcesses(leftovers);
  return leftovers.map((leftover) => `a ${describedProcess(leftover)} still ran; the check stopped it`);
}

/** Before the run's temp folder goes: each entry left in it, which a spec made and did not remove. */
export function temporaryFolderLeaksOf(folders: RunFolders): string[] {
  const { temporaryFolder } = folders;
  if (temporaryFolder === null) return [];
  return directoryEntries(temporaryFolder)
    .filter((entry) => !TEMPORARY_FOLDER_CACHES.includes(entry))
    .map((entry) => `${join(temporaryFolder, entry)} was left in the run's temp folder`);
}

function pathLiesUnder(candidatePath: string, roots: readonly string[]): boolean {
  const canonicalPath = canonicalPathOf(candidatePath);
  return roots.some((root) => canonicalPath.startsWith(`${root}/`));
}

function repositoryLeaksOf(baseline: TestRunBaseline): string[] {
  const before = baseline.repository;
  if (before === null) return [];
  const after = repositoryStateOf(before.directory);
  if (after === null) return [];
  // Other sessions add worktrees and branches to the same repository while the run goes; only a worktree in a temp folder, and a
  // branch no worktree outside one holds, is the run's.
  const runWorktrees = after.worktreePaths.filter((path) => !before.worktreePaths.includes(path) && pathLiesUnder(path, baseline.temporaryRoots));
  const branchesOfOtherWorktrees = new Set(branchesHeldOutside(after.worktreeLines, baseline.temporaryRoots));
  const newBranches  = after.branchNames.filter((name) => !before.branchNames.includes(name) && !branchesOfOtherWorktrees.has(name));
  const changedFiles = after.statusLines.filter((line) => !before.statusLines.includes(line));
  return [
    ...runWorktrees.map((path) => `git worktree ${path} was added to ${before.directory}`),
    ...newBranches.map((name) => `git branch ${name} was added to ${before.directory}`),
    ...changedFiles.map((line) => `git status of ${before.directory} gained "${line}"`),
  ];
}

/** The branches the worktrees of `git worktree list --porcelain` hold, of the worktrees outside every temp folder. */
function branchesHeldOutside(worktreeListLines: readonly string[], temporaryRoots: readonly string[]): string[] {
  const heldBranches: string[] = [];
  let currentWorktreeIsOutside = false;
  for (const line of worktreeListLines) {
    if (line.startsWith('worktree ')) currentWorktreeIsOutside = !pathLiesUnder(line.slice('worktree '.length), temporaryRoots);
    else if (line.startsWith('branch refs/heads/') && currentWorktreeIsOutside) heldBranches.push(line.slice('branch refs/heads/'.length));
  }
  return heldBranches;
}

/** After the run folders went: an entry a spec put straight in the shared root, the run's own folder if it could not go, and git state. */
export function leaksAfterTheRunFoldersWent(baseline: TestRunBaseline, folders: RunFolders): string[] {
  // Every run makes a `run-` folder of its own here; another run's is not this run's to judge.
  const entryIsThisRuns = (entry: string): boolean => (entry.startsWith(RUN_FOLDER_PREFIX)
    ? join(SHARED_SCRATCH_ROOT, entry) === folders.scratchFolder
    : !baseline.scratchRootEntries.has(entry) && !LASTING_SCRATCH_ROOT_ENTRIES.includes(entry));
  const scratchRootLeaks = directoryEntries(SHARED_SCRATCH_ROOT)
    .filter(entryIsThisRuns)
    .map((entry) => `${join(SHARED_SCRATCH_ROOT, entry)} was left in the shared scratch root`);
  const temporaryFolderLeft = folders.temporaryFolder !== null && existsSync(folders.temporaryFolder)
    ? [`${folders.temporaryFolder}, the run's temp folder, could not be removed`]
    : [];
  return [...scratchRootLeaks, ...temporaryFolderLeft, ...repositoryLeaksOf(baseline)];
}

export function leakReport(leaks: readonly string[]): string {
  return [`The test run left ${leaks.length} thing(s) behind:`, ...leaks.map((leak) => `  ${leak}`)].join('\n');
}
