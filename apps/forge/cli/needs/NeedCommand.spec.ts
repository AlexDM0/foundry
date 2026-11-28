/**
 * `need declare` on a scratch forge without entities: a build job that runs no entity's stage is refused `need-outside-an-entity-build` with
 * nothing written, and an incomplete usage is refused. A forge with entities is held in `src/domain/tracker-model/Board.needs.spec.ts`.
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

const USAGE_LINE = 'need declare [<J>] "<title>" --entity <key> --body <text> | --body-file <path> [--json]';

const BODY = '## Acceptance\n\nA1. The web app reads the basket total.\n\n## Brief\n\nAlex Example needs the total.\n';

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
