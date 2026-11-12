/**
 * What a test run leaves behind, found after its last spec: an entry in the run's scratch folder or its scratch home, an entry put straight
 * in the scratch root, a new line in the repository's git status, and a Gaia or forge folder that appeared in the account's real home.
 */
import { existsSync, readdirSync } from 'node:fs';
import { join }                    from 'node:path';

import { runFolderPrefix, scratchHomeFolderName, scratchRoot } from './ScratchRoot.ts';

/** The home entries a spec reaching the real home would make; only their presence is looked at, never their contents. */
const GUARDED_REAL_HOME_PATHS = ['.gaia', join('.forge-monitor', 'gaia')];

export interface TestRunBaseline {
  readonly scratchRootEntries:     ReadonlySet<string>;
  readonly gitStatusLines:         ReadonlySet<string> | null;
  readonly realHomeDirectory:      string;
  readonly guardedHomePathsBefore: ReadonlySet<string>;
}

/** The repository's `git status --porcelain` lines, or null when git cannot answer. */
export type GitStatusReader = () => readonly string[] | null;

export function spawnedGitStatusLines(): readonly string[] | null {
  if (Bun.which('git') === null) return null;
  const finished = Bun.spawnSync(['git', 'status', '--porcelain', '--untracked-files=all'], { cwd: join(import.meta.dir, '..', '..'), stdout: 'pipe', stderr: 'ignore' });
  if (finished.exitCode !== 0) return null;
  return finished.stdout.toString().split('\n').filter((line) => line !== '');
}

function entriesOf(directory: string): string[] {
  return existsSync(directory) ? readdirSync(directory) : [];
}

function guardedHomePathsPresentIn(realHomeDirectory: string): Set<string> {
  return new Set(GUARDED_REAL_HOME_PATHS.filter((guardedPath) => existsSync(join(realHomeDirectory, guardedPath))));
}

export function takeTestRunBaseline(realHomeDirectory: string, gitStatusLinesNow: GitStatusReader): TestRunBaseline {
  const gitStatusLines = gitStatusLinesNow();
  return {
    scratchRootEntries:     new Set(entriesOf(scratchRoot())),
    gitStatusLines:         gitStatusLines === null ? null : new Set(gitStatusLines),
    realHomeDirectory,
    guardedHomePathsBefore: guardedHomePathsPresentIn(realHomeDirectory),
  };
}

/** Before the run folder is removed: every entry a spec made in it, or in the scratch home, and did not remove. */
export function runFolderLeaksOf(runFolder: string | null): string[] {
  if (runFolder === null) return [];
  const homeFolderName = scratchHomeFolderName();
  const runFolderLeaks = entriesOf(runFolder)
    .filter((entry) => entry !== homeFolderName)
    .map((entry) => `${join(runFolder, entry)} was left in the run's scratch folder`);
  const scratchHomeLeaks = entriesOf(join(runFolder, homeFolderName))
    .map((entry) => `${join(runFolder, homeFolderName, entry)} was left in the scratch home`);
  return [...runFolderLeaks, ...scratchHomeLeaks];
}

/** After the run folder is removed: an entry put straight in the scratch root, a changed git status, a guarded path in the real home. */
export function leaksAfterTheRunFolderWent(baseline: TestRunBaseline, gitStatusLinesNow: GitStatusReader): string[] {
  const scratchRootLeaks = entriesOf(scratchRoot())
    .filter((entry) => !entry.startsWith(runFolderPrefix()) && !baseline.scratchRootEntries.has(entry))
    .map((entry) => `${join(scratchRoot(), entry)} was left in the scratch root`);
  const statusLinesAfter = baseline.gitStatusLines === null ? [] : gitStatusLinesNow() ?? [];
  const repositoryLeaks  = statusLinesAfter
    .filter((line) => baseline.gitStatusLines !== null && !baseline.gitStatusLines.has(line))
    .map((line) => `the repository's git status gained "${line}"`);
  const realHomeLeaks = [...guardedHomePathsPresentIn(baseline.realHomeDirectory)]
    .filter((guardedPath) => !baseline.guardedHomePathsBefore.has(guardedPath))
    .map((guardedPath) => `${join(baseline.realHomeDirectory, guardedPath)} appeared in the real home folder`);
  return [...scratchRootLeaks, ...repositoryLeaks, ...realHomeLeaks];
}

export function leakReport(leaks: readonly string[]): string {
  return [`The test run left ${leaks.length} thing(s) behind:`, ...leaks.map((leak) => `  ${leak}`)].join('\n');
}
