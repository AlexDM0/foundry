/**
 * `crash-log` over a scratch board with no forge up: what matters is that it prints the newest log when no number is given and the one
 * named otherwise, that the text carries the component, the classification, the error, the jobs and the log tail, that `--json` is the
 * stored log with its number and path, and that a board with no log, or none of that number, is refused `no-crash-log` at exit 1.
 */
import {
  afterEach,
  beforeEach,
  expect,
  test
} from 'bun:test';

import type { StartClassificationVerdict }        from '../../src/services/overseer/@types/StartClassification.ts';
import { CrashLog }                               from '../../src/services/overseer/CrashLog.ts';
import { overseerFilesIn }                        from '../../src/services/overseer/OverseerFiles.ts';
import { requireWorkspace }                       from '../../src/services/tracker/Workspace.ts';
import { useRecordedGit }                         from '../../src/testing/RecordedGit.ts';
import { removeScratchDirectory }                 from '../../src/testing/ScratchWorkspace.ts';
import { describeWhenGitIsRecorded }              from '../../src/testing/ToolGuard.ts';
import { runCommandLine }                         from '../Main.ts';
import { createCapturedCommandContext }           from '../testing/CapturedCommandContext.ts';
import { createInitializedRecordedGitRepository } from '../testing/InitializedScratchRepository.ts';

const SPEC_CLOCK = (): Date => new Date('2026-09-18T20:11:03Z');

const EXAMPLE_CLASSIFICATION: StartClassificationVerdict = {
  kind:               'crashed',
  previousGeneration: 5,
  crashSuspected:     false,
  crashedComponent:   'talos',
  evidence:           {
    presence:               'read',
    previousEnding:         null,
    previousBootIdentity:   'example-boot',
    currentBootIdentity:    'example-boot',
    newerBatonThanPresence: false,
    talos:                  'lost-this-boot',
    lastHeartbeatAt:        '2026-09-18T20:04:00+00:00',
    bootStartedAt:          null,
  },
};

const recordedGit = useRecordedGit();

let repositoryDirectory = '';

beforeEach(async () => {
  repositoryDirectory = await createInitializedRecordedGitRepository('crash-log', ['--project', 'Example Agency', '--no-hooks'], SPEC_CLOCK, recordedGit);
  recordedGit.enterFlowStage('tracker ready', repositoryDirectory);
});

afterEach(() => {
  removeScratchDirectory(repositoryDirectory);
});

function filesOfTheBoard() {
  return overseerFilesIn(requireWorkspace(repositoryDirectory).trackerDirectory);
}

function writeCrashLog(crashedGeneration: number, errorName: string, classification: StartClassificationVerdict | null): number {
  return CrashLog.writeOnce(filesOfTheBoard(), CrashLog.assemble({
    crashedGeneration,
    component:  'talos',
    suspected:  false,
    classification,
    recordedAt: '2026-09-18T20:05:00+00:00',
    recordedBy: { generation: null, startOrigin: 'login-item', crashPath: false },
    error:      {
      origin: 'talos-lost', name: errorName, message: 'an example crash', stack: null
    },
    presence:    null,
    batonHolder: { processId: 4000 + crashedGeneration, startStamp: '1600000000', bootIdentity: 'example-boot' },
    heartbeat:   null,
    activeJobs:  [{
      jobId:         'J3',
      kind:          'build',
      role:          'builder',
      ticketIds:     ['004'],
      state:         'running',
      interruption:  null,
      instance:      2,
      airlockPhase:  null,
      eventSequence: 17,
    }],
    talosChildren: null,
    logTail:       ['an example log line'],
  })).crashLogNumber;
}

async function crashLogRun(commandLine: readonly string[]) {
  const context = createCapturedCommandContext({ currentDirectory: repositoryDirectory });
  const exitCode = await runCommandLine(['crash-log', ...commandLine], context);
  return { exitCode, context };
}

describeWhenGitIsRecorded('crash-log', () => {
  test('prints the newest crash log when no number is given: component, classification, error, jobs and log tail', async () => {
    writeCrashLog(4, 'OlderError', null);
    const newestNumber = writeCrashLog(5, 'NewestError', EXAMPLE_CLASSIFICATION);

    const { exitCode, context } = await crashLogRun([]);

    expect(exitCode, context.errorText()).toBe(0);
    const text = context.outputText();
    expect(text).toContain(`crash log ${newestNumber} (${CrashLog.pathOf(filesOfTheBoard(), newestNumber)})`);
    expect(text).toContain('component: talos, Baton 5');
    expect(text).toContain('classification: crashed (talos)');
    expect(text).toContain('Talos lost-this-boot, last beat 2026-09-18T20:04:00+00:00');
    expect(text).toContain('error (talos-lost): NewestError: an example crash');
    expect(text).toContain('J3 build (builder) #004: running, instance 2, event 17');
    expect(text).toContain('log tail (1 lines):\n  an example log line');
    expect(text).not.toContain('OlderError');
  });

  test('prints the crash log of the number given, and --json is the stored log with its number and path', async () => {
    const olderNumber = writeCrashLog(4, 'OlderError', null);
    writeCrashLog(5, 'NewestError', EXAMPLE_CLASSIFICATION);

    const { exitCode, context } = await crashLogRun([String(olderNumber), '--json']);

    expect(exitCode, context.errorText()).toBe(0);
    expect(JSON.parse(context.outputText())).toMatchObject({
      number:            olderNumber,
      path:              CrashLog.pathOf(filesOfTheBoard(), olderNumber),
      crashedGeneration: 4,
      error:             { name: 'OlderError' },
      classification:    null,
    });
  });

  test('a board with no crash log is refused no-crash-log at exit 1', async () => {
    const { exitCode, context } = await crashLogRun([]);

    expect(exitCode).toBe(1);
    expect(context.errorText()).toContain('This board has no crash log:');
    expect(context.outputText()).toBe('');
  });

  test('a number with no crash log is refused no-crash-log at exit 1, pointing at the newest', async () => {
    writeCrashLog(4, 'OlderError', null);

    const { exitCode, context } = await crashLogRun(['9']);

    expect(exitCode).toBe(1);
    expect(context.errorText()).toContain('This board has no crash log 9; `');
  });

  test('a number that is not a whole number from 1 is refused at exit 1 with the usage', async () => {
    const { exitCode, context } = await crashLogRun(['0']);

    expect(exitCode).toBe(1);
    expect(context.errorText()).toContain('"0" is not a crash log number.');
  });
});
