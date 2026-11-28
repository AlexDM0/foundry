/**
 * Whose session a job carries on in a forge with entities: a build, an Airlock agent or a stale green resumes only a session of its own
 * entity and stage, so a package's stage 2 never resumes the home builder's stage 1; a stage job relaunched after a wind-down starts fresh;
 * and launches that name no entity carry on as they always did.
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

import { createEventLogWriter }                           from '../../domain/talos/EventLog.ts';
import type { Job, JobKind, JobRole }                     from '../../domain/tracker-model/@types/Job.ts';
import type { LogRecord }                                 from '../../domain/tracker-model/@types/LogRecord.ts';
import { fakeAgentAdapter, fakeStartedLine }              from '../../testing/FakeAgentAdapter.ts';
import { nativePlatformPorts }                            from '../../testing/NativePlatformPorts.ts';
import { createScratchDirectory, removeScratchDirectory } from '../../testing/ScratchWorkspace.ts';
import { childFilesIn, talosChildReadingsWith }           from '../../testing/TalosChildReadings.ts';
import type { BoardChildren }                             from './BoardChildren.ts';
import { jobFolderIn }                                    from './HephaestusFiles.ts';
import { JobResumption, type SessionOwnerAnswer }         from './JobResumption.ts';
import { RED_HANDOFF_FILES, RedHandoff }                  from './RedHandoff.ts';

const AT = '2026-11-17T10:00:00+01:00';

interface EntityAndStage {
  entity?: string;
  stage?:  number;
}

const HOME_STAGE_ONE: EntityAndStage = { entity: 'example-app', stage: 1 };
const PACKAGE_STAGE_TWO: EntityAndStage = { entity: 'example-package', stage: 2 };
const HOME_STAGE_FIVE: EntityAndStage = { entity: 'example-app', stage: 5 };
const NO_ENTITY: EntityAndStage = {};

function launched(jobId: string, kind: JobKind, role: JobRole, scope: EntityAndStage, parentJobId: string | null = null): LogRecord {
  return {
    at:     AT,
    kind:   'job-launched',
    jobId,
    fields: {
      kind, role, ticketIds: ['001'], attempt: 1, target: 'main', parentJobId, ...scope
    }
  };
}

function ended(jobId: string, outcome: 'built' | 'reviewed' | 'wound-down'): LogRecord {
  return {
    at: AT, kind: 'job-ended', jobId, fields: { outcome, deniedPermissions: [] }
  };
}

function jobOf(id: string, kind: JobKind, role: JobRole, scope: EntityAndStage, parentJobId: string | null = null): Job {
  return {
    id,
    kind,
    role,
    ticketIds:          ['001'],
    parentJobId,
    attempt:            1,
    target:             'main',
    state:              'running',
    childInstance:      1,
    eventCursor:        { instance: 1, sequence: 0 },
    answeredRequestIds: [],
    crashResumes:       0,
    ...scope,
  };
}

/** The tracker's children as Hephaestus reads them, by the job folders of the tracker the case made. */
function childrenOfTheTracker(trackerDirectory: string): BoardChildren {
  return talosChildReadingsWith(nativePlatformPorts(), trackerDirectory);
}

describe('a build after a built builder of the same attempt', () => {
  function sessionOwnerOf(earlierScope: EntityAndStage, laterScope: EntityAndStage): string {
    const records = [launched('J1', 'build', 'builder', earlierScope), ended('J1', 'built'), launched('J2', 'build', 'builder', laterScope)];
    return JobResumption.sessionOwnerJobIdOf(records, jobOf('J2', 'build', 'builder', laterScope));
  }

  test('carries on that session when both run the same entity and stage', () => {
    expect(sessionOwnerOf(HOME_STAGE_ONE, HOME_STAGE_ONE)).toBe('J1');
  });

  test('in stage 2 of a package never resumes the home builder\'s stage 1 session', () => {
    expect(sessionOwnerOf(HOME_STAGE_ONE, PACKAGE_STAGE_TWO)).toBe('J2');
  });

  test('of the same entity in another stage starts a session of its own', () => {
    expect(sessionOwnerOf(HOME_STAGE_ONE, HOME_STAGE_FIVE)).toBe('J2');
  });

  test('carries on as always where no launch names an entity', () => {
    expect(sessionOwnerOf(NO_ENTITY, NO_ENTITY)).toBe('J1');
  });

  test('E17: after a package build of its stage that wound down, starts a session of its own, as a build after a wind-down does today', () => {
    const relaunchedOwnerOf = (scope: EntityAndStage): string => JobResumption.sessionOwnerJobIdOf(
      [launched('J1', 'build', 'builder', scope), ended('J1', 'wound-down'), launched('J2', 'build', 'builder', scope)],
      jobOf('J2', 'build', 'builder', scope),
    );

    expect(relaunchedOwnerOf(PACKAGE_STAGE_TWO)).toBe('J2');
    expect(relaunchedOwnerOf(PACKAGE_STAGE_TWO)).toBe(relaunchedOwnerOf(NO_ENTITY));
  });
});

describe('an Airlock agent after the ticket\'s last worker', () => {
  function recordsWithWorker(workerScope: EntityAndStage, agentScope: EntityAndStage): LogRecord[] {
    return [launched('J1', 'review', 'reviewer', workerScope), ended('J1', 'reviewed'), launched('J3', 'merge-agent', 'reviewer', agentScope, 'M1')];
  }

  test('stands in for a worker of its own entity and stage, carrying on its session and taking its launch pair', () => {
    const agent = jobOf('J3', 'merge-agent', 'reviewer', HOME_STAGE_FIVE, 'M1');
    const records = recordsWithWorker(HOME_STAGE_FIVE, HOME_STAGE_FIVE);

    expect(JobResumption.sessionOwnerJobIdOf(records, agent)).toBe('J1');
    expect(JobResumption.lastWorkerJobIdOf(records, agent)).toBe('J1');
  });

  test('is a fresh session with its own launch pair after a worker of another entity or stage', () => {
    const agent = jobOf('J3', 'merge-agent', 'reviewer', HOME_STAGE_FIVE, 'M1');
    const records = recordsWithWorker(PACKAGE_STAGE_TWO, HOME_STAGE_FIVE);

    expect(JobResumption.sessionOwnerJobIdOf(records, agent)).toBe('J3');
    expect(JobResumption.lastWorkerJobIdOf(records, agent)).toBeNull();
  });
});

describe('a stale green that turned red', () => {
  let trackerDirectory = '';

  beforeEach(() => {
    trackerDirectory = createScratchDirectory('stale-green-entities');
  });

  afterEach(() => {
    removeScratchDirectory(trackerDirectory);
  });

  /** `J1` reviewed, left a stale-green handoff and started its session; `J2` is the next review. */
  function staleGreenSessionOwnerOf(earlierScope: EntityAndStage, laterScope: EntityAndStage): SessionOwnerAnswer<string | null> {
    const folder = join(jobFolderIn(trackerDirectory, 'J1'), RED_HANDOFF_FILES.staleGreenFolder);
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
    const { eventLogPath } = childFilesIn(jobFolderIn(trackerDirectory, 'J1'), 1);
    mkdirSync(join(eventLogPath, '..'), { recursive: true });
    const writer = createEventLogWriter(eventLogPath, () => AT);
    writer.append('agent', fakeStartedLine('fake-session'));
    writer.syncAndClose();
    const records = [launched('J1', 'review', 'reviewer', earlierScope), ended('J1', 'reviewed'), launched('J2', 'review', 'reviewer', laterScope)];
    return JobResumption.staleGreenSessionOwnerOf(
      childrenOfTheTracker(trackerDirectory), trackerDirectory, records, jobOf('J2', 'review', 'reviewer', laterScope), fakeAgentAdapter()
    );
  }

  test('resumes the session of its own entity and stage', () => {
    expect(staleGreenSessionOwnerOf(HOME_STAGE_FIVE, HOME_STAGE_FIVE)).toEqual({ verdict: 'answered', sessionOwnerJobId: 'J1' });
  });

  test('leaves the handoff to a fresh session when the ended session ran another entity or stage', () => {
    expect(staleGreenSessionOwnerOf(PACKAGE_STAGE_TWO, HOME_STAGE_FIVE)).toEqual({ verdict: 'answered', sessionOwnerJobId: null });
  });
});
