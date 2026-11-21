/**
 * `init` and `start` below the git floor, through the real binary, whose git plays recorded answers with the version as a fixed answer, since
 * no real git can be put below the floor. What matters: each refuses with exit 1 and words the floor and the version found, before it writes
 * anything, and a git at the floor lets `init` through.
 */
import { existsSync, realpathSync } from 'node:fs';
import { join }                     from 'node:path';

import { afterEach, expect, test } from 'bun:test';

import type { GitRun }                                                             from '../src/lib/git/GitProcess.ts';
import { PRODUCT_NAMES }                                                           from '../src/shared/constants/ProductNames.ts';
import { CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS }                                 from '../src/testing/ChildProcessCaseTimeout.ts';
import { type RecordedGitStage, useRecordedGit }                                   from '../src/testing/RecordedGit.ts';
import { removeScratchDirectory }                                                  from '../src/testing/ScratchWorkspace.ts';
import { describeWhenGitIsRecorded }                                               from '../src/testing/ToolGuard.ts';
import { runAgentProgressBesideRecordedGit }                                       from './testing/CliProcess.ts';
import { createRecordedGitRepository }                                             from './testing/InitializedScratchRepository.ts';
import { BINARY_INIT_IN_A_NEW_REPOSITORY, COMMON_FOLDER_AT_THE_ROOT, GIT_VERSION } from './testing/RecordedGitStages.ts';

const recordedGit = useRecordedGit();

const scratchDirectories: string[] = [];

afterEach(() => {
  for (const directory of scratchDirectories.splice(0)) removeScratchDirectory(directory);
});

function versionPrinted(printedVersion: string): GitRun {
  return { exitCode: 0, standardOutput: `${printedVersion}\n`, standardError: '' };
}

/** `stage` with its `git version` call answered by `printedVersion`. */
function withTheVersion(stage: RecordedGitStage, printedVersion: string): RecordedGitStage {
  return stage.map((step) => step === GIT_VERSION ? { gitArguments: step.gitArguments, fixedAnswer: versionPrinted(printedVersion) } : step);
}

function scratchRepository(): string {
  const repositoryDirectory = realpathSync(createRecordedGitRepository('git-version-floor'));
  scratchDirectories.push(repositoryDirectory);
  return repositoryDirectory;
}

const BELOW_THE_FLOOR = 'git version 2.37.1';

describeWhenGitIsRecorded('the git floor', () => {
  const refusedStages: Array<[commandLine: string[], stage: RecordedGitStage]> = [
    [['init'], withTheVersion([COMMON_FOLDER_AT_THE_ROOT, GIT_VERSION], BELOW_THE_FLOOR)],
    [['start', '--foreground', '--port', '0'], withTheVersion([COMMON_FOLDER_AT_THE_ROOT, GIT_VERSION], BELOW_THE_FLOOR)],
  ];

  test.each(refusedStages)('`%p` below git 2.38 refuses with the floor and the version found, and writes no tracker', async (commandLine, recordedGitStage) => {
    const repositoryDirectory = scratchRepository();
    const result = await runAgentProgressBesideRecordedGit(recordedGit, [COMMON_FOLDER_AT_THE_ROOT], commandLine, { currentDirectory: repositoryDirectory, recordedGitStage });

    expect(result.exitCode).toBe(1);
    expect(result.standardError).toContain('needs git 2.38 or newer');
    expect(result.standardError).toContain('2.37.1');
    expect(existsSync(join(repositoryDirectory, PRODUCT_NAMES.DATA_FOLDER))).toBe(false);
  }, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);

  test('`init` at git 2.38.0 is let through', async () => {
    const repositoryDirectory = scratchRepository();
    const recordedGitStage = withTheVersion(BINARY_INIT_IN_A_NEW_REPOSITORY, 'git version 2.38.0');
    const result = await runAgentProgressBesideRecordedGit(recordedGit, [COMMON_FOLDER_AT_THE_ROOT], ['init'], { currentDirectory: repositoryDirectory, recordedGitStage });

    expect(result.standardError).toBe('');
    expect(result.exitCode).toBe(0);
  }, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);
});
