/**
 * A stale green that its ticket's gates turned red outside the Airlock, as the next job of the same kind finds it. What matters: the
 * red handoff is read from the `stale-green` folder of the ended job, never from its own folder; the ended session is resumed only when its
 * job folder shows that session started, and a fresh session takes the handoff over otherwise; a job after an ended job with no
 * stale-green handoff resumes nothing; and only a job replaced after a failed stale-green resume hands on the facts it adopted, since another
 * replaced job can hold the facts of a red handoff it already fixed.
 */
import { mkdirSync } from 'node:fs';
import { join }      from 'node:path';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  test
} from 'bun:test';

import type { Job }                                       from '../../lib/tracker-model/@types/Job.ts';
import type { LogRecord }                                 from '../../lib/tracker-model/@types/LogRecord.ts';
import { createEventLogWriter }                           from '../../lib/watcher/EventLog.ts';
import { watcherFilesOf }                                 from '../../lib/watcher/WatcherFiles.ts';
import { fakeAgentAdapter, fakeStartedLine }              from '../../testing/FakeAgentAdapter.ts';
import { createScratchDirectory, removeScratchDirectory } from '../../testing/ScratchWorkspace.ts';
import { JobResumption, RESUME_FAILED_CAUSE }             from './JobResumption.ts';
import { RED_HANDOFF_FILES, RedHandoff }                  from './RedHandoff.ts';
import { WatcherFleet }                                   from './WatcherFleet.ts';

const AT = '2026-11-04T19:30:00+01:00';

let trackerDirectory = '';

beforeEach(() => {
  trackerDirectory = createScratchDirectory('stale-green');
});

afterEach(() => {
  removeScratchDirectory(trackerDirectory);
});

function reviewJob(overrides: Partial<Job> = {}): Job {
  return {
    id:                 'J2',
    kind:               'review',
    role:               'reviewer',
    ticketIds:          ['001'],
    parentJobId:        null,
    attempt:            1,
    target:             'main',
    state:              'running',
    watcherInstance:    1,
    eventCursor:        { instance: 1, sequence: 0 },
    answeredRequestIds: [],
    crashResumes:       0,
    ...overrides,
  };
}

function launched(jobId: string): LogRecord {
  return {
    at:     AT,
    kind:   'job-launched',
    jobId,
    fields: {
      kind: 'review', role: 'reviewer', ticketIds: ['001'], attempt: 1, target: 'main', parentJobId: null
    }
  };
}

function ended(jobId: string): LogRecord {
  return {
    at: AT, kind: 'job-ended', jobId, fields: { outcome: 'reviewed', deniedPermissions: [] }
  };
}

function replaced(jobId: string, cause: string): LogRecord {
  return {
    at: AT, kind: 'job-ended', jobId, fields: { outcome: 'replaced', cause, deniedPermissions: [] }
  };
}

/** J1 left the stale green, J2 resumed its session and was replaced, J3 is the fresh job; J2 adopted the facts into its own folder. */
function replacedAfterStaleGreen(cause: string): LogRecord[] {
  writeStaleGreenFacts('J1');
  const adoptedFacts = RedHandoff.redHandoffFactsOf(join(WatcherFleet.jobFolderOf(trackerDirectory, 'J1'), RED_HANDOFF_FILES.staleGreenFolder));
  if (adoptedFacts !== null) RedHandoff.adoptRedHandoff(WatcherFleet.jobFolderOf(trackerDirectory, 'J2'), adoptedFacts);
  return [launched('J1'), ended('J1'), launched('J2'), replaced('J2', cause), launched('J3')];
}

const RECORDS = [launched('J1'), ended('J1'), launched('J2')];

function writeStaleGreenFacts(jobId: string): void {
  const folder = join(WatcherFleet.jobFolderOf(trackerDirectory, jobId), RED_HANDOFF_FILES.staleGreenFolder);
  mkdirSync(folder, { recursive: true });
  RedHandoff.writeRedHandoff(folder, {
    kind:                'gate',
    name:                'tests',
    command:             'bun test',
    fixCommand:          null,
    commit:              'example-commit',
    exitCode:            null,
    batonPassPath:       RedHandoff.batonPassPathOf(folder),
    fullLogPath:         null,
    resume:              1,
    resumesAllowed:      2,
    callBudget:          30,
    interruptedInstance: 0,
  }, 'expected 2, received 3');
}

function writeSessionStart(jobId: string): void {
  const jobFolder = WatcherFleet.jobFolderOf(trackerDirectory, jobId);
  const { eventLogPath } = watcherFilesOf(jobFolder, 1);
  mkdirSync(join(eventLogPath, '..'), { recursive: true });
  const writer = createEventLogWriter(eventLogPath, () => AT);
  writer.append('agent', fakeStartedLine('fake-session'));
  writer.syncAndClose();
}

describe('a stale green that turned red', () => {
  test('hands the next job the facts of the stale-green folder of the ended job', () => {
    writeStaleGreenFacts('J1');

    expect(JobResumption.redHandoffTakenOverOf(trackerDirectory, RECORDS, reviewJob())).toMatchObject({ name: 'tests', resume: 1, resumesAllowed: 2 });
  });

  test('resumes the ended session when its job folder shows that session started', () => {
    writeStaleGreenFacts('J1');
    writeSessionStart('J1');

    expect(JobResumption.staleGreenSessionOwnerOf(trackerDirectory, RECORDS, reviewJob(), fakeAgentAdapter())).toBe('J1');
  });

  test('leaves the handoff to a fresh session when the ended session never started', () => {
    writeStaleGreenFacts('J1');

    expect(JobResumption.staleGreenSessionOwnerOf(trackerDirectory, RECORDS, reviewJob(), fakeAgentAdapter())).toBeNull();
  });

  test('resumes nothing after an ended job with no stale-green handoff', () => {
    writeSessionStart('J1');

    expect(JobResumption.staleGreenSessionOwnerOf(trackerDirectory, RECORDS, reviewJob(), fakeAgentAdapter())).toBeNull();
  });

  test('a resumed instance resumes the same ended session as its first instance, never a session of its own', () => {
    writeStaleGreenFacts('J1');
    writeSessionStart('J1');

    expect(JobResumption.staleGreenSessionOwnerOf(trackerDirectory, RECORDS, reviewJob({ watcherInstance: 2 }), fakeAgentAdapter())).toBe('J1');
    expect(JobResumption.launchSessionOwnerJobIdOf(trackerDirectory, RECORDS, reviewJob({ watcherInstance: 2 }), fakeAgentAdapter())).toBe('J1');
  });

  test('hands the fresh job after a failed stale-green resume the red handoff the replaced job adopted', () => {
    const records = replacedAfterStaleGreen(RESUME_FAILED_CAUSE);

    expect(JobResumption.redHandoffTakenOverOf(trackerDirectory, records, reviewJob({ id: 'J3' }))).toMatchObject({ name: 'tests', resume: 1, interruptedInstance: 0 });
  });

  test('hands no red handoff after a job replaced for another cause, though its folder holds red-handoff facts', () => {
    expect(JobResumption.redHandoffTakenOverOf(trackerDirectory, replacedAfterStaleGreen('crash-resumes-spent'), reviewJob({ id: 'J3' }))).toBeNull();
  });

  test('hands no red handoff after a failed resume with no stale green before it, though its folder holds old red-handoff facts', () => {
    const records = replacedAfterStaleGreen(RESUME_FAILED_CAUSE);
    const withoutStaleGreen = records.map((record) => (
      record.kind === 'job-ended' && record.jobId === 'J1' ? { ...record, fields: { ...record.fields, outcome: 'does-not-hold' as const } } : record
    ));

    expect(JobResumption.redHandoffTakenOverOf(trackerDirectory, withoutStaleGreen, reviewJob({ id: 'J3' }))).toBeNull();
  });
});
