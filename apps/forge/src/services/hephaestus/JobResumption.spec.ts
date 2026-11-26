/**
 * A stale green that its ticket's gates turned red outside the Airlock, as the next job of the same kind finds it. What matters: the
 * red handoff is read from the `stale-green` folder of the ended job, never from its own folder; the ended session is resumed only when its
 * job folder shows that session started, and a fresh session takes the handoff over otherwise; a job after an ended job with no
 * stale-green handoff resumes nothing; and only a job replaced after a failed stale-green resume hands on the facts it adopted, since another
 * replaced job can hold the facts of a red handoff it already fixed.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join }                     from 'node:path';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  test
} from 'bun:test';

import { createEventLogWriter }                           from '../../lib/talos/EventLog.ts';
import type { Job }                                       from '../../lib/tracker-model/@types/Job.ts';
import type { LogRecord }                                 from '../../lib/tracker-model/@types/LogRecord.ts';
import { fakeAgentAdapter, fakeStartedLine }              from '../../testing/FakeAgentAdapter.ts';
import { nativePlatformPorts }                            from '../../testing/NativePlatformPorts.ts';
import { createScratchDirectory, removeScratchDirectory } from '../../testing/ScratchWorkspace.ts';
import { childFilesIn, talosChildReadingsWith }           from '../../testing/TalosChildReadings.ts';
import type { BoardChildren }                             from './BoardChildren.ts';
import { jobFolderIn }                                    from './HephaestusFiles.ts';
import { JobResumption, RESUME_FAILED_CAUSE }             from './JobResumption.ts';
import { RED_HANDOFF_FILES, RedHandoff }                  from './RedHandoff.ts';
import { keptRedHandoffOf }                               from './testing/KeptRedHandoff.ts';

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
    childInstance:      1,
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
  const adoptedFacts = keptRedHandoffOf(join(jobFolderIn(trackerDirectory, 'J1'), RED_HANDOFF_FILES.staleGreenFolder));
  if (adoptedFacts !== null) RedHandoff.adoptRedHandoff(jobFolderIn(trackerDirectory, 'J2'), adoptedFacts);
  return [launched('J1'), ended('J1'), launched('J2'), replaced('J2', cause), launched('J3')];
}

const RECORDS = [launched('J1'), ended('J1'), launched('J2')];

function writeStaleGreenFacts(jobId: string): void {
  const folder = join(jobFolderIn(trackerDirectory, jobId), RED_HANDOFF_FILES.staleGreenFolder);
  mkdirSync(folder, { recursive: true });
  RedHandoff.writeRedHandoff(folder, {
    kind:                'gate',
    name:                'tests',
    command:             'bun test',
    fixCommand:          null,
    commit:              'example-commit',
    exitCode:            null,
    gateFailureNotePath: RedHandoff.gateFailureNotePathOf(folder),
    fullLogPath:         null,
    resume:              1,
    resumesAllowed:      2,
    callBudget:          30,
    interruptedInstance: 0,
  }, 'expected 2, received 3');
}

function writeSessionStart(jobId: string): void {
  const jobFolder = jobFolderIn(trackerDirectory, jobId);
  const { eventLogPath } = childFilesIn(jobFolder, 1);
  mkdirSync(join(eventLogPath, '..'), { recursive: true });
  const writer = createEventLogWriter(eventLogPath, () => AT);
  writer.append('agent', fakeStartedLine('fake-session'));
  writer.syncAndClose();
}

/** The tracker's children as Hephaestus reads them, by the job folders of the tracker the case made. */
function childrenOfTheTracker(trackerDirectory: string): BoardChildren {
  return talosChildReadingsWith(nativePlatformPorts(), trackerDirectory);
}

describe('a stale green that turned red', () => {
  test('hands the next job the facts of the stale-green folder of the ended job', () => {
    writeStaleGreenFacts('J1');

    expect(JobResumption.redHandoffTakenOverOf(trackerDirectory, RECORDS, reviewJob())).toMatchObject({ name: 'tests', resume: 1, resumesAllowed: 2 });
  });

  test('hands the next job the unreadable file in place of stale-green facts that cannot be read, never a plain task', () => {
    writeStaleGreenFacts('J1');
    writeFileSync(join(jobFolderIn(trackerDirectory, 'J1'), RED_HANDOFF_FILES.staleGreenFolder, 'red-handoff.json'), '{"kind": ');

    expect(JobResumption.redHandoffTakenOverOf(trackerDirectory, RECORDS, reviewJob())).toMatchObject({ verdict: 'unreadable-file', file: 'jobs/J1/stale-green/red-handoff.json' });
  });

  test('resumes the ended session when its job folder shows that session started', () => {
    writeStaleGreenFacts('J1');
    writeSessionStart('J1');

    expect(JobResumption.staleGreenSessionOwnerOf(childrenOfTheTracker(trackerDirectory), trackerDirectory, RECORDS, reviewJob(), fakeAgentAdapter())).toBe('J1');
  });

  test('leaves the handoff to a fresh session when the ended session never started', () => {
    writeStaleGreenFacts('J1');

    expect(JobResumption.staleGreenSessionOwnerOf(childrenOfTheTracker(trackerDirectory), trackerDirectory, RECORDS, reviewJob(), fakeAgentAdapter())).toBeNull();
  });

  test('resumes nothing after an ended job with no stale-green handoff', () => {
    writeSessionStart('J1');

    expect(JobResumption.staleGreenSessionOwnerOf(childrenOfTheTracker(trackerDirectory), trackerDirectory, RECORDS, reviewJob(), fakeAgentAdapter())).toBeNull();
  });

  test('a resumed instance resumes the same ended session as its first instance, never a session of its own', () => {
    writeStaleGreenFacts('J1');
    writeSessionStart('J1');

    expect(JobResumption.staleGreenSessionOwnerOf(
      childrenOfTheTracker(trackerDirectory), trackerDirectory, RECORDS, reviewJob({ childInstance: 2 }), fakeAgentAdapter()
    )).toBe('J1');
    expect(JobResumption.launchSessionOwnerJobIdOf(
      childrenOfTheTracker(trackerDirectory), trackerDirectory, RECORDS, reviewJob({ childInstance: 2 }), fakeAgentAdapter()
    )).toBe('J1');
  });

  test('a resumed instance resumes the session its first instance recorded, though another same-work job ended between the two instances', () => {
    writeStaleGreenFacts('J1');
    writeSessionStart('J1');
    const firstInstanceOwner = JobResumption.staleGreenSessionOwnerOf(childrenOfTheTracker(trackerDirectory), trackerDirectory, RECORDS, reviewJob(), fakeAgentAdapter());
    JobResumption.recordStaleGreenSessionOwner(trackerDirectory, reviewJob(), firstInstanceOwner);
    const recordsAfterJ4Ended = [...RECORDS, launched('J4'), ended('J4')];
    const secondInstance = reviewJob({ childInstance: 2 });

    expect(firstInstanceOwner).toBe('J1');
    expect(JobResumption.staleGreenSessionOwnerOf(childrenOfTheTracker(trackerDirectory), trackerDirectory, recordsAfterJ4Ended, secondInstance, fakeAgentAdapter())).toBe('J1');
    expect(JobResumption.launchSessionOwnerJobIdOf(childrenOfTheTracker(trackerDirectory), trackerDirectory, recordsAfterJ4Ended, secondInstance, fakeAgentAdapter())).toBe('J1');
  });

  test('a resumed instance whose first instance recorded no stale-green session resumes its own, though a later same-work job left one', () => {
    JobResumption.recordStaleGreenSessionOwner(trackerDirectory, reviewJob(), null);
    writeStaleGreenFacts('J4');
    writeSessionStart('J4');
    const recordsAfterJ4Ended = [...RECORDS, launched('J4'), ended('J4')];

    expect(JobResumption.launchSessionOwnerJobIdOf(
      childrenOfTheTracker(trackerDirectory), trackerDirectory, recordsAfterJ4Ended, reviewJob({ childInstance: 2 }), fakeAgentAdapter()
    )).toBe('J2');
  });

  test('a resumed instance never overwrites the answer its first instance recorded', () => {
    JobResumption.recordStaleGreenSessionOwner(trackerDirectory, reviewJob(), 'J1');
    JobResumption.recordStaleGreenSessionOwner(trackerDirectory, reviewJob({ childInstance: 2 }), null);

    expect(JobResumption.staleGreenSessionOwnerOf(
      childrenOfTheTracker(trackerDirectory), trackerDirectory, RECORDS, reviewJob({ childInstance: 2 }), fakeAgentAdapter()
    )).toBe('J1');
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

// The Airlock agent takes the launch pair of the worker it stands in for, also as a fresh session after one of its merge was replaced.
describe('the last worker an Airlock agent stands in for', () => {
  const airlockLaunch = (jobId: string): LogRecord => ({
    at:     AT,
    kind:   'job-launched',
    jobId,
    fields: {
      kind: 'merge-agent', role: 'reviewer', ticketIds: ['001'], attempt: 1, target: 'main', parentJobId: 'M1'
    }
  });
  const airlockReviewer = (jobId: string): Job => reviewJob({ id: jobId, kind: 'merge-agent', parentJobId: 'M1' });

  test('is the ticket\'s newest ended review, also when an Airlock agent of the same merge was replaced', () => {
    const reviewed = [launched('J1'), ended('J1'), launched('J2'), ended('J2')];

    expect(JobResumption.lastWorkerJobIdOf([...reviewed, airlockLaunch('A1')], airlockReviewer('A1'))).toBe('J2');
    const afterReplaced = [...reviewed, airlockLaunch('A1'), replaced('A1', 'resume-failed'), airlockLaunch('A2')];
    expect(JobResumption.sessionOwnerJobIdOf(afterReplaced, airlockReviewer('A2'))).toBe('A2');
    expect(JobResumption.lastWorkerJobIdOf(afterReplaced, airlockReviewer('A2'))).toBe('J2');
  });

  test('is none for a job that is no Airlock agent, and for an Airlock agent whose ticket has no ended worker', () => {
    expect(JobResumption.lastWorkerJobIdOf(RECORDS, reviewJob())).toBeNull();
    expect(JobResumption.lastWorkerJobIdOf([airlockLaunch('A1')], airlockReviewer('A1'))).toBeNull();
  });
});

// The merge train's conflict fixer is whoever last worked on the branch, read from history and never from the pipeline (`docs/glossary.md`,
// "last worker").
describe('the last worker of a ticket', () => {
  const builderLaunch = (jobId: string): LogRecord => ({
    at:     AT,
    kind:   'job-launched',
    jobId,
    fields: {
      kind: 'build', role: 'builder', ticketIds: ['001'], attempt: 1, target: 'main', parentJobId: null
    }
  });
  const reReviewerLaunch = (jobId: string): LogRecord => ({
    at:     AT,
    kind:   'job-launched',
    jobId,
    fields: {
      kind: 'review', role: 're-reviewer', ticketIds: ['001'], attempt: 2, target: 'main', parentJobId: null
    }
  });
  const conflictReReviewer = (jobId: string): Job => reviewJob({
    id: jobId, kind: 'merge-agent', role: 'conflict-re-reviewer', parentJobId: 'M1'
  });

  test('is the newest ended build or review job of the ticket, with the role it ran as, whatever kind ended before it', () => {
    expect(JobResumption.lastWorkerOf([builderLaunch('J1'), ended('J1')], '001')).toEqual({ jobId: 'J1', kind: 'build', role: 'builder' });
    expect(JobResumption.lastWorkerOf([builderLaunch('J1'), ended('J1'), launched('J2'), ended('J2'), reReviewerLaunch('J3'), ended('J3')], '001'))
      .toEqual({ jobId: 'J3', kind: 'review', role: 're-reviewer' });
  });

  test('is none while the ticket\'s workers still run, and for another ticket', () => {
    expect(JobResumption.lastWorkerOf([builderLaunch('J1')], '001')).toBeNull();
    expect(JobResumption.lastWorkerOf([builderLaunch('J1'), ended('J1')], '002')).toBeNull();
  });

  test('an Airlock agent standing in for a re-reviewer resumes the re-reviewer\'s session', () => {
    const records = [launched('J1'), ended('J1'), reReviewerLaunch('J2'), ended('J2')];
    expect(JobResumption.sessionOwnerJobIdOf(records, reviewJob({
      id: 'A1', kind: 'merge-agent', role: 're-reviewer', parentJobId: 'M1'
    }))).toBe('J2');
  });

  test('a conflict re-reviewer is a fresh session of its own and stands in for no worker', () => {
    const records = [launched('J1'), ended('J1')];
    expect(JobResumption.sessionOwnerJobIdOf(records, conflictReReviewer('A2'))).toBe('A2');
    expect(JobResumption.lastWorkerJobIdOf(records, conflictReReviewer('A2'))).toBeNull();
  });
});
