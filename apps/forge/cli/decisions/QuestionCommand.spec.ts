/**
 * `question options` on a scratch tracker with a running build job: the notes land on the job trimmed and nothing is logged, since they only wait
 * for the question; malformed input is refused at exit 1, writing nothing. The verb under the asking job is in `cli/HatchUnderJob.spec.ts`.
 */
import { readFileSync, writeFileSync } from 'node:fs';

import {
  afterEach,
  beforeEach,
  expect,
  test
} from 'bun:test';

import type { Job }                               from '../../src/domain/tracker-model/@types/Job.ts';
import { localStoreLayoutOf }                     from '../../src/services/tracker/LocalStoreLayout.ts';
import { workspacePathsFor }                      from '../../src/services/tracker/Workspace.ts';
import { useRecordedGit }                         from '../../src/testing/RecordedGit.ts';
import { removeScratchDirectory }                 from '../../src/testing/ScratchWorkspace.ts';
import { describeWhenGitIsRecorded }              from '../../src/testing/ToolGuard.ts';
import { runCommandLine }                         from '../Main.ts';
import { createCapturedCommandContext }           from '../testing/CapturedCommandContext.ts';
import { createInitializedRecordedGitRepository } from '../testing/InitializedScratchRepository.ts';
import { storedLogTextOf }                        from '../testing/StoredLogText.ts';
import { storedProgressOf }                       from '../testing/StoredProgress.ts';

const FROZEN_NOW = new Date('2026-09-18T20:11:03Z');

const EXIT_REFUSED = 1;

const USAGE_LINE = 'question options <J> -- <json> [--json]';

let repositoryDirectory = '';

async function runWithExitCode(commandLineArguments: readonly string[]): Promise<{ exitCode: number; context: ReturnType<typeof createCapturedCommandContext> }> {
  const context  = createCapturedCommandContext({ currentDirectory: repositoryDirectory, now: () => FROZEN_NOW });
  const exitCode = await runCommandLine(commandLineArguments, context);
  return { exitCode, context };
}

function progressFileText(): string {
  return readFileSync(localStoreLayoutOf(workspacePathsFor(repositoryDirectory)).progressRecordPath, 'utf8');
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
  writeFileSync(localStoreLayoutOf(workspacePathsFor(repositoryDirectory)).progressRecordPath, `${JSON.stringify(progress, null, 2)}\n`);
}

const recordedGit = useRecordedGit();

beforeEach(async () => {
  repositoryDirectory = await createInitializedRecordedGitRepository('question-command', ['--project', 'Example Agency'], () => FROZEN_NOW, recordedGit);
  writeRunningBuildJob();
});

afterEach(() => {
  removeScratchDirectory(repositoryDirectory);
});

describeWhenGitIsRecorded('question options', () => {
  test('keeps the trimmed notes on the named job and logs nothing', async () => {
    const logBefore = storedLogTextOf(repositoryDirectory);
    const notes     = '{"question": " Which basket? ", "options": [{"label": "Wicker", "touches": ["src/basket/Wicker.ts"], "tradeOff": " Lighter. "}]}';
    const { exitCode, context } = await runWithExitCode(['question', 'options', 'j1', '--', notes]);

    expect(exitCode, context.errorText()).toBe(0);
    expect(context.outputText()).toBe('Job J1 keeps the option notes for its question "Which basket?".');
    const keptOption = { label: 'Wicker', touches: ['src/basket/Wicker.ts'], tradeOff: 'Lighter.' };
    expect(storedProgressOf(repositoryDirectory).jobs?.[0]?.pendingOptionNotes).toEqual([{ question: 'Which basket?', options: [keptOption] }]);
    expect(storedLogTextOf(repositoryDirectory)).toBe(logBefore);
  });

  test('--json prints the job and the notes as kept', async () => {
    const { context } = await runWithExitCode(['question', 'options', 'J1', '--json', '--', '{"question": "Which basket?", "options": [{"label": "Wicker"}]}']);
    expect(JSON.parse(context.outputText())).toEqual({ jobId: 'J1', question: 'Which basket?', options: [{ label: 'Wicker' }] });
  });

  test.each([
    [['question', 'options', '--', '{"question": "Which basket?", "options": [{"label": "Wicker"}]}'], 'Name the job, as J4.'],
    [['question', 'options', 'J1', '--', 'Which basket?'], 'The notes after -- are not JSON.'],
    [['question', 'options', 'J1', '{"question": "Which basket?"}'], 'Write the notes as JSON after --'],
    [['question', 'answers', 'J1', '--', '{}'], 'Name the subcommand: question options.'],
    [
      ['question', 'options', 'J1', '--', '{"question": "Which basket?", "options": [{"label": "Wicker", "colour": "Brown"}]}'],
      'The option notes for job J1 are malformed: options[0].colour is not a field of the notes',
    ],
  ])('%p is refused at exit 1 and writes nothing', async (commandLine, reason) => {
    const progressBefore = progressFileText();
    const { exitCode, context } = await runWithExitCode(commandLine);

    expect(exitCode).toBe(EXIT_REFUSED);
    expect(context.errorText()).toContain(reason);
    expect(progressFileText()).toBe(progressBefore);
  });

  test('a usage refusal shows the usage line', async () => {
    const { context } = await runWithExitCode(['question', 'options', 'J1', '--', 'not json']);
    expect(context.errorText()).toContain(USAGE_LINE);
  });

  test('a job never launched is refused unknown-job', async () => {
    const { exitCode, context } = await runWithExitCode(['question', 'options', 'J9', '--', '{"question": "Which basket?", "options": [{"label": "Wicker"}]}']);
    expect(exitCode).toBe(EXIT_REFUSED);
    expect(context.errorText()).toContain('There is no job J9.');
  });
});
