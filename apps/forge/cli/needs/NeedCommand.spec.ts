/**
 * `need declare` as the command surface of a forge without entities sees it, run on a scratch tracker with a running build job written in.
 * The cases that matter: the build job runs no entity's stage, so the need is refused `need-outside-an-entity-build` at exit 1 and
 * progress.json and the log stay byte-identical, no `needs` key written; a missing job, title, entity or body, both body options and an
 * unknown subcommand are refused by the usage. What a forge with entities keeps is held in `src/lib/tracker-model/Board.needs.spec.ts` and
 * `src/services/control/JobControls.spec.ts`; the verb under the declaring job, which names no job and relays, in `cli/HatchUnderJob.spec.ts`.
 */
import { readFileSync, writeFileSync } from 'node:fs';

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
import { storedLogTextOf }                        from '../testing/StoredLogText.ts';
import { storedProgressOf }                       from '../testing/StoredProgress.ts';

const FROZEN_NOW = new Date('2026-09-18T20:11:03Z');

const EXIT_REFUSED = 1;

const USAGE_LINE = 'need declare [<J>] "<title>" --entity <key> --body <text> | --body-file <path> [--json]';

const BODY = '## Acceptance\n\nA1. The web app reads the basket total.\n\n## Brief\n\nAlex Example needs the total.\n';

let repositoryDirectory = '';

async function runWithExitCode(commandLineArguments: readonly string[]): Promise<{ exitCode: number; context: ReturnType<typeof createCapturedCommandContext> }> {
  const context  = createCapturedCommandContext({ currentDirectory: repositoryDirectory, now: () => FROZEN_NOW });
  const exitCode = await runCommandLine(commandLineArguments, context);
  return { exitCode, context };
}

function progressFileText(): string {
  return readFileSync(workspacePathsFor(repositoryDirectory).progressFilePath, 'utf8');
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
  repositoryDirectory = await createInitializedRecordedGitRepository('need-command', ['--project', 'Example Agency'], () => FROZEN_NOW, recordedGit);
  writeRunningBuildJob();
});

afterEach(() => {
  removeScratchDirectory(repositoryDirectory);
});

describeWhenGitIsRecorded('need declare', () => {
  test('a forge without entities refuses the need need-outside-an-entity-build, with progress.json and the log unchanged', async () => {
    const progressBefore = progressFileText();
    const logBefore      = storedLogTextOf(repositoryDirectory);

    const { exitCode, context } = await runWithExitCode(['need', 'declare', 'j1', 'Export the basket total', '--entity', 'shared', '--body', BODY]);

    expect(exitCode).toBe(EXIT_REFUSED);
    expect(context.errorText()).toContain('Job J1 declared no need: only a build job of an entity declares one');
    expect(progressFileText()).toBe(progressBefore);
    expect(progressFileText()).not.toContain('"needs"');
    expect(storedLogTextOf(repositoryDirectory)).toBe(logBefore);
  });

  test.each([
    [['need', 'declare', 'Export the basket total', '--entity', 'shared', '--body', BODY], 'is not a job id'],
    [['need', 'declare', 'J1', '--entity', 'shared', '--body', BODY], 'Write the title of the need.'],
    [['need', 'declare', 'J1', 'Export the basket total', '--body', BODY], 'Name the entity that the need is for, with --entity.'],
    [['need', 'declare', 'J1', 'Export the basket total', '--entity', 'shared'], 'Give the body of the need, with --body or --body-file.'],
    [['need', 'declare', 'J1', 'Export the basket total', '--entity', 'shared', '--body', BODY, '--body-file', 'need.md'], 'Give --body or --body-file, not both.'],
    [['need', 'file', 'J1', 'Export the basket total'], 'Name the subcommand: need declare.'],
  ] as const)('%p is refused by the usage, writing nothing', async (commandLine, problem) => {
    const progressBefore = progressFileText();
    const { exitCode, context } = await runWithExitCode(commandLine);
    expect(exitCode).toBe(EXIT_REFUSED);
    expect(context.errorText()).toContain(problem);
    expect(context.errorText()).toContain(USAGE_LINE);
    expect(progressFileText()).toBe(progressBefore);
  });
});
