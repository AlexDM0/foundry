/**
 * What a test run leaves behind, found after its last spec: an entry in the run's scratch folder, its scratch home or its scratch temporary
 * folder, an entry put straight in the scratch root, a new line in the repository's git status, a child process still running, and a Gaia
 * or forge path that appeared in the account's real home. A change inside a guarded home path that was already there is only a warning,
 * since a live Gaia or forge on the machine writes there too.
 */
import { existsSync, lstatSync, readdirSync } from 'node:fs';
import { join }                               from 'node:path';

import {
  runFolderPrefix,
  scratchHomeFolderName,
  scratchRoot,
  scratchTemporaryFolderName,
} from './ScratchRoot.ts';

/** The home paths a spec reaching the real home would write; their entries' names, sizes and times are looked at, never their contents. */
const GUARDED_REAL_HOME_PATHS = [
  '.gaia',
  join('.forge-monitor', 'gaia'),
  join('.forge-monitor', 'projects.json'),
  join('Applications', 'Gaia.app'),
];
const DIRECTORY_SIGNATURE = 'directory';
const UNREADABLE_DIRECTORY_SIGNATURE = 'unreadable directory';
const PROCESS_LISTING_LINE = /^\s*(\d+)\s+(\d+)\s+(\S+)\s+(.*)$/;
const ZOMBIE_STATE_PREFIX = 'Z';

export interface RunningChildProcess {
  readonly processId: number;
  readonly command:   string;
}

/** The repository's `git status --porcelain` lines, or null when git cannot answer. */
export type GitStatusReader = () => readonly string[] | null;

/** The test run's own child processes still running, or null when the machine cannot answer. */
export type ChildProcessReader = () => readonly RunningChildProcess[] | null;

export interface RunStateReaders {
  readonly gitStatusLinesNow: GitStatusReader;
  readonly childProcessesNow: ChildProcessReader;
}

export interface TestRunBaseline {
  readonly scratchRootEntries:       ReadonlySet<string>;
  readonly gitStatusLines:           ReadonlySet<string> | null;
  readonly childProcessIds:          ReadonlySet<number>;
  readonly realHomeDirectory:        string;
  readonly realTemporaryDirectory:   string;
  readonly guardedHomeEntriesBefore: ReadonlyMap<string, string>;
}

export function spawnedGitStatusLines(): readonly string[] | null {
  if (Bun.which('git') === null) return null;
  const finished = Bun.spawnSync(['git', 'status', '--porcelain', '--untracked-files=all'], { cwd: join(import.meta.dir, '..', '..'), stdout: 'pipe', stderr: 'ignore' });
  if (finished.exitCode !== 0) return null;
  return finished.stdout.toString().split('\n').filter((line) => line !== '');
}

/** The children of this process that have not ended, leaving out the listing's own `ps` and a child that ended and waits to be reaped. */
export function spawnedChildProcesses(): readonly RunningChildProcess[] | null {
  if (Bun.which('ps') === null) return null;
  const finished = Bun.spawnSync(['ps', '-A', '-o', 'pid=,ppid=,stat=,command='], { stdout: 'pipe', stderr: 'ignore' });
  if (finished.exitCode !== 0) return null;
  return finished.stdout.toString().split('\n').flatMap((line) => {
    const match = PROCESS_LISTING_LINE.exec(line);
    if (match === null) return [];
    const [, processIdText = '', parentProcessIdText = '', state = '', command = ''] = match;
    const processId = Number(processIdText);
    const isOwnRunningChild = Number(parentProcessIdText) === process.pid && processId !== finished.pid && !state.startsWith(ZOMBIE_STATE_PREFIX);
    return isOwnRunningChild ? [{ processId, command }] : [];
  });
}

export const SPAWNED_RUN_STATE_READERS: RunStateReaders = {
  gitStatusLinesNow: spawnedGitStatusLines,
  childProcessesNow: spawnedChildProcesses,
};

function entriesOf(directory: string): string[] {
  return existsSync(directory) ? readdirSync(directory) : [];
}

function addGuardedEntriesBelow(realHomeDirectory: string, pathFromHome: string, signatures: Map<string, string>): void {
  const status = lstatSync(join(realHomeDirectory, pathFromHome), { throwIfNoEntry: false });
  if (status === undefined) return;
  if (!status.isDirectory()) {
    // Contents are never read, so the size, inode and modification time are a file's only sign of a change; they are compared for equality only.
    signatures.set(pathFromHome, `${status.size} bytes, inode ${status.ino}, modified ${status.mtimeMs}`);
    return;
  }
  let entryNames: string[];
  try {
    entryNames = readdirSync(join(realHomeDirectory, pathFromHome));
  } catch {
    signatures.set(pathFromHome, UNREADABLE_DIRECTORY_SIGNATURE);
    return;
  }
  signatures.set(pathFromHome, DIRECTORY_SIGNATURE);
  for (const entryName of entryNames) addGuardedEntriesBelow(realHomeDirectory, join(pathFromHome, entryName), signatures);
}

/** Every entry at or below a guarded home path, by its path from the home, with what tells a change of it. */
function guardedHomeEntriesIn(realHomeDirectory: string): Map<string, string> {
  const signatures = new Map<string, string>();
  for (const guardedPath of GUARDED_REAL_HOME_PATHS) addGuardedEntriesBelow(realHomeDirectory, guardedPath, signatures);
  return signatures;
}

export function takeTestRunBaseline(realHomeDirectory: string, realTemporaryDirectory: string, readers: RunStateReaders): TestRunBaseline {
  const gitStatusLines = readers.gitStatusLinesNow();
  return {
    scratchRootEntries:       new Set(entriesOf(scratchRoot())),
    gitStatusLines:           gitStatusLines === null ? null : new Set(gitStatusLines),
    childProcessIds:          new Set((readers.childProcessesNow() ?? []).map(({ processId }) => processId)),
    realHomeDirectory,
    realTemporaryDirectory,
    guardedHomeEntriesBefore: guardedHomeEntriesIn(realHomeDirectory),
  };
}

/** Before the run folder is removed: every entry a spec made in it, in the scratch home or in the scratch temporary folder, and did not remove. */
export function runFolderLeaksOf(runFolder: string | null): string[] {
  if (runFolder === null) return [];
  const homeFolderName      = scratchHomeFolderName();
  const temporaryFolderName = scratchTemporaryFolderName();
  const runFolderLeaks = entriesOf(runFolder)
    .filter((entry) => entry !== homeFolderName && entry !== temporaryFolderName)
    .map((entry) => `${join(runFolder, entry)} was left in the run's scratch folder`);
  const scratchHomeLeaks = entriesOf(join(runFolder, homeFolderName))
    .map((entry) => `${join(runFolder, homeFolderName, entry)} was left in the scratch home`);
  const scratchTemporaryLeaks = entriesOf(join(runFolder, temporaryFolderName))
    .map((entry) => `${join(runFolder, temporaryFolderName, entry)} was left in the scratch temporary folder`);
  return [...runFolderLeaks, ...scratchHomeLeaks, ...scratchTemporaryLeaks];
}

function guardedPathsThatAppeared(baseline: TestRunBaseline, guardedHomeEntriesAfter: ReadonlyMap<string, string>): string[] {
  return GUARDED_REAL_HOME_PATHS.filter((guardedPath) => guardedHomeEntriesAfter.has(guardedPath) && !baseline.guardedHomeEntriesBefore.has(guardedPath));
}

/** After the run folder is removed: an entry put straight in the scratch root, a changed git status, a child still running, a new guarded home path. */
export function leaksAfterTheRunFolderWent(baseline: TestRunBaseline, readers: RunStateReaders): string[] {
  const scratchRootLeaks = entriesOf(scratchRoot())
    .filter((entry) => !entry.startsWith(runFolderPrefix()) && !baseline.scratchRootEntries.has(entry))
    .map((entry) => `${join(scratchRoot(), entry)} was left in the scratch root`);
  const statusLinesAfter = baseline.gitStatusLines === null ? [] : readers.gitStatusLinesNow() ?? [];
  const repositoryLeaks  = statusLinesAfter
    .filter((line) => baseline.gitStatusLines !== null && !baseline.gitStatusLines.has(line))
    .map((line) => `the repository's git status gained "${line}"`);
  const processLeaks = (readers.childProcessesNow() ?? [])
    .filter(({ processId }) => !baseline.childProcessIds.has(processId))
    .map(({ processId, command }) => `process ${processId} (${command}) was still running`);
  const realHomeLeaks = guardedPathsThatAppeared(baseline, guardedHomeEntriesIn(baseline.realHomeDirectory))
    .map((guardedPath) => `${join(baseline.realHomeDirectory, guardedPath)} appeared in the real home folder`);
  return [...scratchRootLeaks, ...repositoryLeaks, ...processLeaks, ...realHomeLeaks];
}

/** Each entry added, removed or changed inside a guarded home path that was there before the run; a newly appeared guarded path is a leak instead. */
export function realHomeChangesOf(baseline: TestRunBaseline): string[] {
  const entriesBefore = baseline.guardedHomeEntriesBefore;
  const entriesAfter  = guardedHomeEntriesIn(baseline.realHomeDirectory);
  const appearedPaths = guardedPathsThatAppeared(baseline, entriesAfter);
  const liesBelowAnAppearedPath = (pathFromHome: string): boolean => appearedPaths.some((appeared) => pathFromHome === appeared || pathFromHome.startsWith(`${appeared}/`));
  const fullPathOf = (pathFromHome: string): string => join(baseline.realHomeDirectory, pathFromHome);
  const added   = [...entriesAfter.keys()].filter((pathFromHome) => !entriesBefore.has(pathFromHome) && !liesBelowAnAppearedPath(pathFromHome))
    .map((pathFromHome) => `${fullPathOf(pathFromHome)} appeared`);
  const removed = [...entriesBefore.keys()].filter((pathFromHome) => !entriesAfter.has(pathFromHome))
    .map((pathFromHome) => `${fullPathOf(pathFromHome)} was removed`);
  const changed = [...entriesAfter].filter(([pathFromHome, signature]) => entriesBefore.has(pathFromHome) && entriesBefore.get(pathFromHome) !== signature)
    .map(([pathFromHome]) => `${fullPathOf(pathFromHome)} changed`);
  return [...added, ...removed, ...changed];
}

export function leakReport(leaks: readonly string[]): string {
  return [`The test run left ${leaks.length} thing(s) behind:`, ...leaks.map((leak) => `  ${leak}`)].join('\n');
}

export function realHomeChangeReport(changes: readonly string[]): string {
  return [
    `The real home folder changed in ${changes.length} guarded place(s) during the test run. A running Gaia or forge writes there too, so this`
      + ' fails no run; if none ran, a spec reached the real home:',
    ...changes.map((change) => `  ${change}`),
  ].join('\n');
}
