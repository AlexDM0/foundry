/**
 * The ids a recorded move reads: an `--incident` value is checked as `I<n>` exactly as a positional one, so a mistyped one is refused rather than
 * stored and never matched; both accept lower case, neither 0 nor a leading zero. Under a job the move is relayed through the Hatch.
 */
import { readdirSync } from 'node:fs';
import { join }        from 'node:path';
import {
  afterEach,
  describe,
  expect,
  test
} from 'bun:test';

import { useRecordedGit }                                 from '../src/testing/RecordedGit.ts';
import { createScratchDirectory, removeScratchDirectory } from '../src/testing/ScratchWorkspace.ts';
import { describeWhenGitIsRecorded }                      from '../src/testing/ToolGuard.ts';
import { refusalIsHatchConcluded }                        from './HatchUnderJob.ts';
import {
  incidentIdOf,
  incidentOf,
  jobIdOf,
  recordIncidentMove
} from './RecordedIncidentMove.ts';
import { createArgumentParser }                   from './arguments/ArgumentParser.ts';
import { createCapturedCommandContext }           from './testing/CapturedCommandContext.ts';
import { createInitializedRecordedGitRepository } from './testing/InitializedScratchRepository.ts';

const USAGE = 'example usage';

function refusalMessageOf(action: () => unknown): string {
  try {
    action();
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  return 'no refusal';
}

describe('an --incident value', () => {
  test('is optional: without it the move names no incident', () => {
    expect(incidentOf(createArgumentParser(['J4']), USAGE)).toEqual({});
  });

  test('is stored upper-cased when it is an incident id', () => {
    expect(incidentOf(createArgumentParser(['J4', '--incident', 'i7']), USAGE)).toEqual({ incidentId: 'I7' });
  });

  test('is refused, worded as a positional incident id is, when it is not an incident id', () => {
    const positionalWording = refusalMessageOf(() => incidentIdOf('X7', USAGE));
    expect(refusalMessageOf(() => incidentOf(createArgumentParser(['J4', '--incident', 'X7']), USAGE))).toBe(positionalWording);
    expect(positionalWording).toBe(`"X7" is not an incident id. Write I and its number, as I4.\n  Usage: ${USAGE}`);
    expect(refusalMessageOf(() => incidentOf(createArgumentParser(['J4', '--incident', 'I0']), USAGE))).toContain('"I0" is not an incident id.');
  });
});

describe('a job id', () => {
  test('is stored upper-cased', () => {
    expect(jobIdOf('j12', USAGE)).toBe('J12');
  });

  test('is refused when it is missing, zero or not J and a number', () => {
    expect(refusalMessageOf(() => jobIdOf(undefined, USAGE))).toBe(`Name the job, as J4.\n  Usage: ${USAGE}`);
    expect(refusalMessageOf(() => jobIdOf('J0', USAGE))).toContain('"J0" is not a job id.');
    expect(refusalMessageOf(() => jobIdOf('J04', USAGE))).toContain('"J04" is not a job id.');
    expect(refusalMessageOf(() => jobIdOf('I4', USAGE))).toContain('"I4" is not a job id.');
  });
});

const FROZEN_NOW = new Date('2026-09-23T10:00:00Z');
const recordedGit = useRecordedGit();
const scratchDirectories: string[] = [];

afterEach(() => {
  for (const directory of scratchDirectories.splice(0)) removeScratchDirectory(directory);
});

describeWhenGitIsRecorded('a move under a job', () => {
  test('is relayed through the Hatch and never reaches the store', async () => {
    const repositoryDirectory = await createInitializedRecordedGitRepository('recorded-incident-move', ['--project', 'Example Agency'], () => FROZEN_NOW, recordedGit);
    const hatchDirectory      = createScratchDirectory('recorded-incident-move-hatch');
    scratchDirectories.push(repositoryDirectory, hatchDirectory);
    const context = {
      ...createCapturedCommandContext({ currentDirectory: repositoryDirectory }),
      // A folder that does not exist: reaching the store there would fail on a git call no recording answers.
      currentDirectory: join(repositoryDirectory, 'no-board-here'),
      job:              {
        jobId: 'J7', hatchDirectory, replyTries: 1, replyIntervalMilliseconds: 1
      },
    };
    const ended = await recordIncidentMove(createArgumentParser(['stop', 'J1']), context, { kind: 'job-stop', jobId: 'J1', mode: 'stop' })
      .then(() => null, (thrown: unknown) => thrown);
    expect(refusalIsHatchConcluded(ended) ? ended.exitCode : ended).toBe(0);
    expect(readdirSync(join(hatchDirectory, 'requests'))).toHaveLength(1);
  });
});
