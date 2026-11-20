/**
 * `job attach` following a job to its end. What matters: an entry Talos writes after attach's last print, with the job leaving the
 * board before the next poll, is still printed before the command returns, and every entry prints exactly once. The entry is written and
 * the job removed from inside the output callback, so the race against the poll is decided by the code, never by a clock. A live job whose
 * instance jumps by two between polls still prints the instance between. A finished job names its newest instance only in the log records
 * that raised it, so its replay reads them, and `job show` gives its last ending.
 */
import {
  appendFileSync,
  mkdirSync,
  readFileSync,
  writeFileSync
} from 'node:fs';
import { join } from 'node:path';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  test
} from 'bun:test';

import type { Job }                               from '../../src/lib/tracker-model/@types/Job.ts';
import { jobFolderIn }                            from '../../src/services/overseer/OverseerFiles.ts';
import { localStoreLayoutOf }                     from '../../src/services/tracker/LocalStoreLayout.ts';
import { requireWorkspace }                       from '../../src/services/tracker/Workspace.ts';
import { useRecordedGit }                         from '../../src/testing/RecordedGit.ts';
import { removeScratchDirectory }                 from '../../src/testing/ScratchWorkspace.ts';
import { describeWhenGitIsRecorded }              from '../../src/testing/ToolGuard.ts';
import { runCommandLine }                         from '../Main.ts';
import { createCapturedCommandContext }           from '../testing/CapturedCommandContext.ts';
import { createInitializedRecordedGitRepository } from '../testing/InitializedScratchRepository.ts';

const SPEC_CLOCK = (): Date => new Date('2026-09-18T20:11:03Z');

const JOB_ID = 'J3';

const FIRST_LINE = '[1.1] > client: Example first message';
const LAST_LINE  = '[1.2] > client: Example message written after the last poll';

const LOGGED_AT = '2026-09-18T22:11:03+02:00';

function jobRecordLineOf(kind: string, fields: Record<string, unknown>): string {
  return `${JSON.stringify({
    at: LOGGED_AT, kind, jobId: JOB_ID, fields
  })}\n`;
}

function productOwnerJob(): Job {
  return {
    id:                 JOB_ID,
    kind:               'product-owner',
    role:               'product-owner',
    ticketIds:          [],
    parentJobId:        null,
    attempt:            1,
    target:             null,
    state:              'running',
    childInstance:      1,
    eventCursor:        { instance: 1, sequence: 0 },
    answeredRequestIds: [],
    crashResumes:       0,
  };
}

function eventLineOf(sequence: number, line: string): string {
  return `${JSON.stringify({ sequence, origin: 'client', line })}\n`;
}

const recordedGit = useRecordedGit();

describeWhenGitIsRecorded('job attach following a job to its end', () => {
  let repositoryDirectory = '';
  let progressRecordPath    = '';
  let eventLogPath        = '';
  let jobFolder           = '';
  let logFilePath         = '';

  function writeBoardJobs(jobs: readonly Job[]): void {
    const progress = JSON.parse(readFileSync(progressRecordPath, 'utf8')) as Record<string, unknown>;
    writeFileSync(progressRecordPath, `${JSON.stringify({ ...progress, jobs }, null, 2)}\n`);
  }

  beforeEach(async () => {
    repositoryDirectory = await createInitializedRecordedGitRepository('job-attach', ['--project', 'Example Agency', '--no-hooks'], SPEC_CLOCK, recordedGit);
    const workspace = requireWorkspace(repositoryDirectory);
    ({ logRecordPath: logFilePath } = localStoreLayoutOf(workspace));
    progressRecordPath = join(workspace.trackerDirectory, 'progress.json');
    jobFolder        = jobFolderIn(workspace.trackerDirectory, JOB_ID);
    mkdirSync(jobFolder, { recursive: true });
    eventLogPath = join(jobFolder, 'events-1.ndjson');
    writeFileSync(eventLogPath, eventLineOf(1, 'Example first message'));
    writeBoardJobs([productOwnerJob()]);
  });

  afterEach(() => {
    removeScratchDirectory(repositoryDirectory);
  });

  test('prints the entry written after its last print once the job has left the board, each entry exactly once', async () => {
    const captured = createCapturedCommandContext({ currentDirectory: repositoryDirectory, now: SPEC_CLOCK });
    const context = {
      ...captured,
      standardOutput: (text: string) => {
        captured.standardOutput(text);
        if (text !== FIRST_LINE) return;
        appendFileSync(eventLogPath, eventLineOf(2, 'Example message written after the last poll'));
        writeBoardJobs([]);
      },
    };
    const exitCode = await runCommandLine(['job', 'attach', JOB_ID], context);
    expect({ exitCode, error: captured.errorText() }).toEqual({ exitCode: 0, error: '' });
    expect(captured.outputText().split('\n').filter((line) => line !== '')).toEqual([FIRST_LINE, LAST_LINE]);
  });

  test('--json replays the log without following', async () => {
    appendFileSync(eventLogPath, eventLineOf(2, 'Example message written after the last poll'));
    const captured = createCapturedCommandContext({ currentDirectory: repositoryDirectory, now: SPEC_CLOCK });
    const exitCode = await runCommandLine(['job', 'attach', JOB_ID, '--json'], captured);
    expect(exitCode).toBe(0);
    expect(JSON.parse(captured.outputText())).toEqual({ jobId: JOB_ID, lines: [FIRST_LINE, LAST_LINE] });
  });

  test('a live job whose instance jumps by two between polls prints the instance between', async () => {
    const captured = createCapturedCommandContext({ currentDirectory: repositoryDirectory, now: SPEC_CLOCK });
    const context = {
      ...captured,
      standardOutput: (text: string) => {
        captured.standardOutput(text);
        if (text === FIRST_LINE) {
          writeFileSync(join(jobFolder, 'events-2.ndjson'), eventLineOf(1, 'Example message of the second instance'));
          writeFileSync(join(jobFolder, 'events-3.ndjson'), eventLineOf(1, 'Example message of the third instance'));
          writeBoardJobs([{ ...productOwnerJob(), childInstance: 3 }]);
        }
        if (text.startsWith('[3.1]')) writeBoardJobs([]);
      },
    };
    const exitCode = await runCommandLine(['job', 'attach', JOB_ID], context);
    expect({ exitCode, error: captured.errorText() }).toEqual({ exitCode: 0, error: '' });
    expect(captured.outputText().split('\n').filter((line) => line !== '')).toEqual([
      FIRST_LINE,
      '[2.1] > client: Example message of the second instance',
      '[3.1] > client: Example message of the third instance',
    ]);
  });

  describe('a finished job that was resumed, then reopened and ended again', () => {
    const REPLAY = [
      FIRST_LINE,
      '[2.1] > client: Example message after the resume',
      '[3.1] > client: Example message after the reopening',
    ];

    beforeEach(() => {
      writeBoardJobs([]);
      writeFileSync(join(jobFolder, 'events-2.ndjson'), eventLineOf(1, 'Example message after the resume'));
      writeFileSync(join(jobFolder, 'events-3.ndjson'), eventLineOf(1, 'Example message after the reopening'));
      appendFileSync(logFilePath, [
        jobRecordLineOf('job-launched', {
          kind: 'product-owner', role: 'product-owner', ticketIds: [], attempt: 1, target: null, parentJobId: null
        }),
        jobRecordLineOf('job-interrupted', { cause: 'agent-crashed', childInstance: 1 }),
        jobRecordLineOf('job-resumed', { childInstance: 2, cause: 'agent-crashed' }),
        jobRecordLineOf('job-ended', { outcome: 'closed', deniedPermissions: [] }),
        jobRecordLineOf('job-reopened', { childInstance: 3, text: 'Example question', offeredTicketIds: [] }),
        jobRecordLineOf('job-ended', { outcome: 'stopped', deniedPermissions: [] }),
      ].join(''));
    });

    test('attach replays every instance its log records raised, with and without --json', async () => {
      const followed = createCapturedCommandContext({ currentDirectory: repositoryDirectory, now: SPEC_CLOCK });
      expect(await runCommandLine(['job', 'attach', JOB_ID], followed)).toBe(0);
      expect(followed.outputText().split('\n').filter((line) => line !== '')).toEqual(REPLAY);
      const replayed = createCapturedCommandContext({ currentDirectory: repositoryDirectory, now: SPEC_CLOCK });
      expect(await runCommandLine(['job', 'attach', JOB_ID, '--json'], replayed)).toBe(0);
      expect(JSON.parse(replayed.outputText())).toEqual({ jobId: JOB_ID, lines: REPLAY });
    });

    test('show gives its last ending', async () => {
      const captured = createCapturedCommandContext({ currentDirectory: repositoryDirectory, now: SPEC_CLOCK });
      expect(await runCommandLine(['job', 'show', JOB_ID, '--json'], captured)).toBe(0);
      const shown = JSON.parse(captured.outputText()) as { job: { ended: { outcome: string } } };
      expect(shown.job.ended.outcome).toBe('stopped');
    });
  });
});
