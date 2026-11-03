/**
 * Real directories for the specs that decide from what is on disk; nothing here calls `process.chdir`, because the suite is one process and a
 * changed working directory would be a cross-test dependency invisible from either file. Test-only: nothing that ships may import
 * `src/testing/`.
 */
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir }           from 'node:os';
import { isAbsolute, join } from 'node:path';

import { moveTemporaryFolderTo } from '../shared/Environment.ts';
import {
  canonicalPathOf,
  pathLiesInside,
  scratchRootDirectories,
  SHARED_SCRATCH_ROOT,
} from './TrackerIsolation.ts';

const SCRATCH_COMMIT_AUTHOR_NAME  = 'Alex Example';
const SCRATCH_COMMIT_AUTHOR_EMAIL = 'alex.example@example.com';

/** The `-c` pairs any git command that writes a commit in a scratch repository needs, whatever the machine's own configuration says. */
export const SCRATCH_COMMIT_IDENTITY_ARGUMENTS = [
  '-c',
  `user.name=${SCRATCH_COMMIT_AUTHOR_NAME}`,
  '-c',
  `user.email=${SCRATCH_COMMIT_AUTHOR_EMAIL}`,
  '-c',
  'commit.gpgsign=false',
] as const;

export function gitIsAvailable(): boolean {
  return Bun.which('git') !== null;
}

let runScratchFolder: string | null = null;

/** This run's own folder under the shared root, made at first use and removed whole by `removeRunScratchFolder` when the run ends. */
export function runScratchRoot(): string {
  if (runScratchFolder === null) {
    mkdirSync(SHARED_SCRATCH_ROOT, { recursive: true });
    runScratchFolder = mkdtempSync(join(SHARED_SCRATCH_ROOT, 'run-'));
  }
  return runScratchFolder;
}

export function createScratchDirectory(prefix: string): string {
  return mkdtempSync(join(runScratchRoot(), `${prefix}-`));
}

/**
 * Under `tmpdir()`, for the few specs that need a folder outside `/tmp` and `/var/tmp`; guard them with
 * `testWhenGitIsPresentAndTheScratchRootIsOutsideTmp` and remove the folder in the spec.
 */
export function createScratchDirectoryOutsideTheFixedTemporaryFolders(prefix: string): string {
  return mkdtempSync(join(tmpdir(), `agent-progress-${prefix}-`));
}

/** Resolved through symlinks (`/private/var` rather than `/var` on macOS), so it compares equal to a path discovery found. */
export function createCanonicalScratchDirectory(prefix: string): string {
  return realpathSync(createScratchDirectory(prefix));
}

let emptyRepositoryTemplateDirectory: string | null = null;

/** Marks a scratch directory built once and copied by many cases: no spec removes it, and the run folder takes it when the run ends. */
export function keptAsTemplateUntilTheRunEnds(templateDirectory: string): string {
  return templateDirectory;
}

/** Copies the template's contents into a fresh scratch directory. */
export function createScratchCopyOf(templateDirectory: string, prefix: string): string {
  const copyDirectory = createScratchDirectory(prefix);
  cpSync(templateDirectory, copyDirectory, { recursive: true });
  return copyDirectory;
}

/** The same, under `tmpdir()`, as `createScratchDirectoryOutsideTheFixedTemporaryFolders` says. */
export function createScratchCopyOutsideTheFixedTemporaryFolders(templateDirectory: string, prefix: string): string {
  const copyDirectory = createScratchDirectoryOutsideTheFixedTemporaryFolders(prefix);
  cpSync(templateDirectory, copyDirectory, { recursive: true });
  return copyDirectory;
}

/** The empty commit is not decoration: `git worktree add` refuses a repository with no commits. */
function emptyRepositoryTemplate(): string {
  if (emptyRepositoryTemplateDirectory === null) {
    const templateDirectory = keptAsTemplateUntilTheRunEnds(createScratchDirectory('repository-template'));
    gitOutputIn(templateDirectory, ['init', '-q']);
    gitOutputIn(templateDirectory, [...SCRATCH_COMMIT_IDENTITY_ARGUMENTS, 'commit', '-q', '--allow-empty', '-m', 'Initial commit']);
    emptyRepositoryTemplateDirectory = templateDirectory;
  }
  return emptyRepositoryTemplateDirectory;
}

/** A copy of one repository built once per run, since spawning git to build each one is most of what a git spec's setup costs. */
export function createScratchGitRepository(prefix: string): string {
  return createScratchCopyOf(emptyRepositoryTemplate(), prefix);
}

/** This run's folder under the shared root when a spec made one, without making it. */
export function existingRunScratchRoot(): string | null {
  return runScratchFolder;
}

/** Called once, after the whole run, by the preload `src/testing/TestRunReport.ts`; it takes every folder a spec forgot to remove. */
export function removeRunScratchFolder(): void {
  emptyRepositoryTemplateDirectory = null;
  if (runScratchFolder === null) return;
  rmSync(runScratchFolder, { recursive: true, force: true, maxRetries: 3 });
  runScratchFolder = null;
}

let runTemporaryFolderPath: string | null = null;
let temporaryFolderBeforeTheRun: string | null = null;

/**
 * Called once, when the run starts, by the preload `src/testing/TestRunReport.ts`: a folder of the run's own under the machine's temp folder,
 * so it stays outside `/tmp`, made `TMPDIR` for the run and every child it starts, so whatever lands in it is known to be this run's.
 */
export function moveTheRunIntoATemporaryFolderOfItsOwn(): string {
  if (runTemporaryFolderPath === null) {
    temporaryFolderBeforeTheRun = tmpdir();
    runTemporaryFolderPath      = mkdtempSync(join(temporaryFolderBeforeTheRun, 'agent-progress-run-'));
    moveTemporaryFolderTo(runTemporaryFolderPath);
  }
  return runTemporaryFolderPath;
}

export function runTemporaryFolder(): string | null {
  return runTemporaryFolderPath;
}

/** Called once, after the whole run, by the same preload; it gives `TMPDIR` back. */
export function removeRunTemporaryFolder(): void {
  if (runTemporaryFolderPath === null || temporaryFolderBeforeTheRun === null) return;
  rmSync(runTemporaryFolderPath, { recursive: true, force: true, maxRetries: 3 });
  moveTemporaryFolderTo(temporaryFolderBeforeTheRun);
  runTemporaryFolderPath      = null;
  temporaryFolderBeforeTheRun = null;
}

/** Created beside the repository, never inside it, so a walk up from the worktree cannot find the main checkout's tracker by accident. */
export function addWorktree(repositoryDirectory: string, name: string): string {
  const worktreeDirectory = join(`${repositoryDirectory}-worktrees`, name);
  gitOutputIn(repositoryDirectory, ['worktree', 'add', '-q', '-b', `worktree/${name}`, worktreeDirectory]);
  return worktreeDirectory;
}

/** Writes the file, commits it alone, and answers the new commit. */
export function commitFile(repositoryDirectory: string, fileName: string, content: string): string {
  writeFileSync(join(repositoryDirectory, fileName), content);
  gitOutputIn(repositoryDirectory, ['add', '--', fileName]);
  gitOutputIn(repositoryDirectory, [...SCRATCH_COMMIT_IDENTITY_ARGUMENTS, 'commit', '-q', '-m', `Change ${fileName}`]);
  return gitOutputIn(repositoryDirectory, ['rev-parse', 'HEAD']);
}

export function currentBranchOf(repositoryDirectory: string): string {
  return gitOutputIn(repositoryDirectory, ['symbolic-ref', '--short', 'HEAD']);
}

/**
 * `force`, so an `afterEach` cleaning up after a test that failed before creating anything does not turn one red test into two. A path that
 * is relative, empty, the scratch root itself or outside it throws and removes nothing: a teardown whose setup threw must not reach a real folder.
 * Without a `scratchRoot`, every root in `scratchRootDirectories` counts.
 */
export function removeScratchDirectory(directory: string, scratchRoot?: string): void {
  const scratchRoots = scratchRoot === undefined ? scratchRootDirectories() : [canonicalPathOf(scratchRoot)];
  if (!isAbsolute(directory) || !scratchRoots.some((root) => pathLiesInside(canonicalPathOf(directory), root))) {
    throw new Error(`Refused to remove ${JSON.stringify(directory)}: a scratch directory is an absolute path strictly inside ${scratchRoots.join(' or ')}.`);
  }
  rmSync(directory, { recursive: true, force: true });
}

/** Throws on a non-zero exit, so a scratch setup step that failed stops the test instead of leaving it to assert on the wrong state. */
export function gitOutputIn(workingDirectory: string, gitArguments: readonly string[]): string {
  if (!gitIsAvailable()) {
    throw new Error('git is not on the PATH; a spec needing a scratch repository must be guarded by src/testing/ToolGuard.ts.');
  }
  const finished = Bun.spawnSync(['git', ...gitArguments], { cwd: workingDirectory, stdout: 'pipe', stderr: 'pipe' });
  if (finished.exitCode !== 0) {
    const reason = new TextDecoder().decode(finished.stderr).trim();
    throw new Error(`git ${gitArguments.join(' ')} failed in ${workingDirectory}: ${reason}`);
  }
  return new TextDecoder().decode(finished.stdout).trim();
}
