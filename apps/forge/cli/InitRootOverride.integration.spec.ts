/**
 * `init` beside `AGENT_PROGRESS_ROOT`, through the real binary because no spec may set the environment in-process. An override naming a folder
 * without a tracker, run in a tracked repository, must leave that repository's rows and log untouched; each case compares the bytes, since an
 * exit code alone cannot show nothing was lost.
 */
import { createHash }                             from 'node:crypto';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { join }                                   from 'node:path';

import { afterEach, expect, test } from 'bun:test';

import { PRODUCT_NAMES }                                                                           from '../src/shared/constants/ProductNames.ts';
import { ROOT_OVERRIDE_VARIABLE }                                                                  from '../src/shared/constants/RootOverrideVariable.ts';
import { CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS }                                                 from '../src/testing/ChildProcessCaseTimeout.ts';
import { type RecordedGitStage, useRecordedGit }                                                   from '../src/testing/RecordedGit.ts';
import { removeScratchDirectory }                                                                  from '../src/testing/ScratchWorkspace.ts';
import { describeWhenGitIsRecorded }                                                               from '../src/testing/ToolGuard.ts';
import { type AgentProgressResult, runAgentProgress }                                              from './testing/CliProcess.ts';
import { createRecordedGitRepository }                                                             from './testing/InitializedScratchRepository.ts';
import { BINARY_INIT_IN_A_NEW_REPOSITORY, COMMON_FOLDER_AT_THE_ROOT, INIT_ON_AN_EXISTING_TRACKER } from './testing/RecordedGitStages.ts';

const recordedGit = useRecordedGit();

const scratchDirectories: string[] = [];

afterEach(() => {
  for (const directory of scratchDirectories.splice(0)) removeScratchDirectory(directory);
});

function scratchRepository(prefix: string): string {
  const repositoryDirectory = realpathSync(createRecordedGitRepository(prefix));
  scratchDirectories.push(repositoryDirectory);
  return repositoryDirectory;
}

interface BinaryRun {
  currentDirectory: string;
  environment:      Record<string, string>;
  /** The git calls of the binary. */
  childStage:       RecordedGitStage;
  /** The git calls of this process's isolation check: one root question for each directory it is handed that holds no tracker. */
  parentStage:      RecordedGitStage;
}

async function runTheBinary(commandLineArguments: readonly string[], {
  currentDirectory, environment, childStage, parentStage
}: BinaryRun): Promise<AgentProgressResult> {
  return await recordedGit.playStage(parentStage, async () => runAgentProgress(commandLineArguments, { currentDirectory, environment, recordedGitStage: childStage }));
}

function progressRecordPathOf(repositoryDirectory: string): string {
  return join(repositoryDirectory, PRODUCT_NAMES.DATA_FOLDER, 'progress.json');
}

function trackerFilesHashOf(repositoryDirectory: string): string {
  return createHash('sha256')
    .update(readFileSync(progressRecordPathOf(repositoryDirectory)))
    .update(readFileSync(join(repositoryDirectory, PRODUCT_NAMES.DATA_FOLDER, 'log.jsonl')))
    .digest('hex');
}

async function trackedRepositoryWithARowAndALogLine(): Promise<string> {
  const repositoryDirectory = scratchRepository('init-override-tracked');
  const inTheRepository = { environment: {}, currentDirectory: repositoryDirectory, parentStage: [] };
  const initialised = await runTheBinary(
    ['init', '--project', 'Example Agency'], { ...inTheRepository, childStage: BINARY_INIT_IN_A_NEW_REPOSITORY, parentStage: [COMMON_FOLDER_AT_THE_ROOT] },
  );
  expect(initialised.exitCode, initialised.standardError).toBe(0);
  expect((await runTheBinary(['task', 'add', 'Draft the example page'], { ...inTheRepository, childStage: [] })).exitCode).toBe(0);
  expect((await runTheBinary(['log', 'Example session started'], { ...inTheRepository, childStage: [] })).exitCode).toBe(0);
  return repositoryDirectory;
}

describeWhenGitIsRecorded('init with AGENT_PROGRESS_ROOT set', () => {
  // The reported loss: the override said "no tracker here", and `init` created one where it stood.
  test('an override naming an untracked repository is refused at exit 1, naming both, and neither progress file changes', async () => {
    const trackedDirectory   = await trackedRepositoryWithARowAndALogLine();
    const untrackedDirectory = scratchRepository('init-override-untracked');
    const hashBefore         = trackerFilesHashOf(trackedDirectory);

    const result = await runTheBinary(['init', '--project', 'Example Agency'], {
      currentDirectory: trackedDirectory,
      environment:      { [ROOT_OVERRIDE_VARIABLE]: untrackedDirectory },
      childStage:       [COMMON_FOLDER_AT_THE_ROOT],
      parentStage:      [COMMON_FOLDER_AT_THE_ROOT],
    });

    expect(result.exitCode).toBe(1);
    expect(result.standardError).toContain(ROOT_OVERRIDE_VARIABLE);
    expect(result.standardError).toContain(trackedDirectory);
    expect(result.standardError).toContain(untrackedDirectory);
    expect(trackerFilesHashOf(trackedDirectory)).toBe(hashBefore);
    expect(existsSync(progressRecordPathOf(untrackedDirectory))).toBe(false);
  }, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);

  test('an override naming the tracked repository itself refreshes it like update, at exit 0, with its progress file unchanged', async () => {
    const trackedDirectory = await trackedRepositoryWithARowAndALogLine();
    const hashBefore       = trackerFilesHashOf(trackedDirectory);

    const result = await runTheBinary(['init'], {
      currentDirectory: trackedDirectory,
      environment:      { [ROOT_OVERRIDE_VARIABLE]: trackedDirectory },
      childStage:       INIT_ON_AN_EXISTING_TRACKER,
      parentStage:      [],
    });

    expect(result.exitCode).toBe(0);
    expect(result.standardOutput).toContain(`${PRODUCT_NAMES.PROGRAM} is already initialised`);
    expect(trackerFilesHashOf(trackedDirectory)).toBe(hashBefore);
  }, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);

  test('with the override unset, init in a tracked repository still refreshes it at exit 0, its progress file unchanged', async () => {
    const trackedDirectory = await trackedRepositoryWithARowAndALogLine();
    const hashBefore       = trackerFilesHashOf(trackedDirectory);

    const result = await runTheBinary(['init'], {
      currentDirectory: trackedDirectory, environment: {}, childStage: INIT_ON_AN_EXISTING_TRACKER, parentStage: []
    });

    expect(result.exitCode).toBe(0);
    expect(result.standardOutput).toContain(`${PRODUCT_NAMES.PROGRAM} is already initialised`);
    expect(trackerFilesHashOf(trackedDirectory)).toBe(hashBefore);
  }, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);

  test('--root naming a different directory from the override is refused at exit 1, naming both, and writes nothing there', async () => {
    const trackedDirectory   = await trackedRepositoryWithARowAndALogLine();
    const untrackedDirectory = scratchRepository('init-override-root');
    const hashBefore         = trackerFilesHashOf(trackedDirectory);

    const result = await runTheBinary(['init', '--root', untrackedDirectory], {
      currentDirectory: trackedDirectory,
      environment:      { [ROOT_OVERRIDE_VARIABLE]: trackedDirectory },
      childStage:       [],
      parentStage:      [],
    });

    expect(result.exitCode).toBe(1);
    expect(result.standardError).toContain(ROOT_OVERRIDE_VARIABLE);
    expect(result.standardError).toContain(trackedDirectory);
    expect(result.standardError).toContain(untrackedDirectory);
    expect(existsSync(join(untrackedDirectory, PRODUCT_NAMES.DATA_FOLDER))).toBe(false);
    expect(trackerFilesHashOf(trackedDirectory)).toBe(hashBefore);
  }, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);

  test('--root naming the directory the override names creates the tracker there at exit 0', async () => {
    const untrackedDirectory = scratchRepository('init-override-agreeing-root');

    const result = await runTheBinary(['init', '--root', untrackedDirectory], {
      currentDirectory: untrackedDirectory,
      environment:      { [ROOT_OVERRIDE_VARIABLE]: untrackedDirectory },
      // `--root` names the root, so git is asked neither where it is nor, before the ignore checks, again.
      childStage:       BINARY_INIT_IN_A_NEW_REPOSITORY.filter((step) => step !== COMMON_FOLDER_AT_THE_ROOT),
      parentStage:      [COMMON_FOLDER_AT_THE_ROOT, COMMON_FOLDER_AT_THE_ROOT],
    });

    expect(result.exitCode, result.standardError).toBe(0);
    expect(existsSync(progressRecordPathOf(untrackedDirectory))).toBe(true);
  }, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);
});
