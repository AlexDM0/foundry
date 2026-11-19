/**
 * `intake title`, run by User on a scratch tracker. What matters: the title lands on the product owner's job and in the log as
 * `intake-titled`, beside the request its launch logged as `intakeText`, so a closed session keeps both; a later title replaces the earlier
 * one; and the refusals (no job named, no title, a job of another kind) write nothing. The verb under the product owner's own job, which
 * names no job, is held by `cli/HatchUnderJob.spec.ts`.
 */
import { writeFileSync } from 'node:fs';

import {
  afterEach,
  beforeEach,
  expect,
  test
} from 'bun:test';

import type { Job }                               from '../../src/lib/tracker-model/@types/Job.ts';
import { workspacePathsFor }                      from '../../src/services/tracker/Workspace.ts';
import { useRecordedGit }                         from '../../src/testing/RecordedGit.ts';
import { removeScratchDirectory }                 from '../../src/testing/ScratchWorkspace.ts';
import { describeWhenGitIsRecorded }              from '../../src/testing/ToolGuard.ts';
import { runCommandLine }                         from '../Main.ts';
import { createCapturedCommandContext }           from '../testing/CapturedCommandContext.ts';
import { createInitializedRecordedGitRepository } from '../testing/InitializedScratchRepository.ts';
import { storedLogEntriesOf }                     from '../testing/StoredLogEntries.ts';
import { storedLogTextOf }                        from '../testing/StoredLogText.ts';
import { storedProgressOf }                       from '../testing/StoredProgress.ts';

const FROZEN_NOW = new Date('2026-09-18T20:11:03Z');

const EXIT_REFUSED = 1;

let repositoryDirectory = '';

async function runWithExitCode(commandLineArguments: readonly string[]): Promise<{ exitCode: number; context: ReturnType<typeof createCapturedCommandContext> }> {
  const context  = createCapturedCommandContext({ currentDirectory: repositoryDirectory, now: () => FROZEN_NOW });
  const exitCode = await runCommandLine(commandLineArguments, context);
  return { exitCode, context };
}

async function run(commandLineArguments: readonly string[]): Promise<ReturnType<typeof createCapturedCommandContext>> {
  const { context, exitCode } = await runWithExitCode(commandLineArguments);
  expect(exitCode, `\`intake ${commandLineArguments.join(' ')}\` failed: ${context.errorText()}`).toBe(0);
  return context;
}

function storedJobOf(jobId: string): Job | undefined {
  return storedProgressOf(repositoryDirectory).jobs?.find((job) => job.id === jobId);
}

function writeRunningBuildJob(): void {
  const buildJob: Job = {
    id:                 'J1',
    kind:               'build',
    role:               'builder',
    ticketIds:          ['001'],
    parentJobId:        null,
    attempt:            1,
    target:             'main',
    state:              'running',
    childInstance:      1,
    eventCursor:        { instance: 1, sequence: 0 },
    answeredRequestIds: [],
    crashResumes:       0,
  };
  const progress = { ...storedProgressOf(repositoryDirectory), jobs: [buildJob], nextJobId: 2 };
  writeFileSync(workspacePathsFor(repositoryDirectory).progressFilePath, `${JSON.stringify(progress, null, 2)}\n`);
}

const recordedGit = useRecordedGit();

beforeEach(async () => {
  repositoryDirectory = await createInitializedRecordedGitRepository('intake-command', ['--project', 'Example Agency'], () => FROZEN_NOW, recordedGit);
});

afterEach(() => {
  removeScratchDirectory(repositoryDirectory);
});

describeWhenGitIsRecorded('intake title', () => {
  test('keeps the title on the job and logs it beside the request the launch logged', async () => {
    await run(['intake', '--', 'Alex Example asks for a basket.']);
    const context = await run(['intake', 'title', 'J1', '--', 'Example basket']);

    expect(context.outputText()).toBe('Intake of job J1 titled: Example basket');
    expect(storedJobOf('J1')?.intake).toEqual({ text: 'Alex Example asks for a basket.', title: 'Example basket' });
    expect(storedLogEntriesOf(repositoryDirectory).map((entry) => entry.text).slice(-2)).toEqual([
      'Job J1 launched: product-owner (product-owner), attempt 1 for User\'s request: Alex Example asks for a basket.',
      'Intake of job J1 titled: Example basket',
    ]);
  });

  test('a later title replaces the earlier one on the job, and both stay in the log', async () => {
    await run(['intake', '--', 'Alex Example asks for a basket.']);
    await run(['intake', 'title', 'j1', '--', 'Example basket']);
    await run(['intake', 'title', 'J1', '--', 'Example basket and wishlist']);

    expect(storedJobOf('J1')?.intake?.title).toBe('Example basket and wishlist');
    expect(storedLogEntriesOf(repositoryDirectory).filter((entry) => entry.text.startsWith('Intake of job J1 titled')).length).toBe(2);
  });

  test.each([
    [['intake', 'title', '--', 'Example basket'], 'Name the product-owner job whose intake to title, as J4.'],
    [['intake', 'title', 'J1'], 'Write the title after --.'],
    [['intake', 'title', 'J1', 'Example', 'basket'], 'Write the title after --.'],
    [['intake', 'title', 'J1', '--', '   '], 'Write the title after --.'],
  ])('%p is refused with a usage line and writes nothing', async (commandLine, reason) => {
    await run(['intake', '--', 'Alex Example asks for a basket.']);
    const logBefore = storedLogTextOf(repositoryDirectory);
    const { exitCode, context } = await runWithExitCode(commandLine);

    expect(exitCode).toBe(EXIT_REFUSED);
    expect(context.errorText()).toContain(reason);
    expect(context.errorText()).toContain('intake title <J> -- <title> [--json]');
    expect(storedLogTextOf(repositoryDirectory)).toBe(logBefore);
    expect(storedJobOf('J1')?.intake).toEqual({ text: 'Alex Example asks for a basket.' });
  });

  test('a job that is no product owner is refused job-not-intake, worded for a title, and a job never launched unknown-job', async () => {
    writeRunningBuildJob();
    const logBefore = storedLogTextOf(repositoryDirectory);
    const notIntake = await runWithExitCode(['intake', 'title', 'J1', '--', 'Example basket']);
    const unknown   = await runWithExitCode(['intake', 'title', 'J9', '--', 'Example basket']);

    expect(notIntake.exitCode).toBe(EXIT_REFUSED);
    expect(notIntake.context.errorText()).toContain('Job J1 is a build job, not a product-owner intake, so it has no intake to close or title.');
    expect(unknown.exitCode).toBe(EXIT_REFUSED);
    expect(unknown.context.errorText()).toContain('There is no job J9.');
    expect(storedLogTextOf(repositoryDirectory)).toBe(logBefore);
  });
});
