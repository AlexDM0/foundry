/**
 * Whose session a crossing ticket's Airlock agent carries on. What matters: the home's worker of a conflict carries on the ticket's last
 * home worker of its stage, a package's builder resolving its part of the conflict carries on that package's newest build session though a
 * home review ran after it, and a package's builder whose package never built here starts fresh.
 */
import { describe, expect, test } from 'bun:test';

import type {
  Job,
  JobKind,
  JobOutcome,
  JobRole
} from '../../domain/tracker-model/@types/Job.ts';
import type { LogRecord } from '../../domain/tracker-model/@types/LogRecord.ts';
import { JobResumption }  from './JobResumption.ts';

const AT = '2026-11-17T20:00:00+01:00';

interface EntityAndStage {
  entity: string;
  stage:  number;
}

const HOME_BUILD: EntityAndStage     = { entity: 'example-app', stage: 1 };
const PACKAGE_BUILD: EntityAndStage  = { entity: 'example-package', stage: 2 };
const PACKAGE_REVIEW: EntityAndStage = { entity: 'example-package', stage: 3 };
const HOME_REVIEW: EntityAndStage    = { entity: 'example-app', stage: 5 };
const OTHER_PACKAGE: EntityAndStage  = { entity: 'example-other-package', stage: 2 };

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

function ended(jobId: string, outcome: JobOutcome): LogRecord {
  return {
    at: AT, kind: 'job-ended', jobId, fields: { outcome, deniedPermissions: [] }
  };
}

function airlockAgentOf(id: string, role: JobRole, scope: EntityAndStage): Job {
  return {
    id,
    kind:               'merge-agent',
    role,
    ticketIds:          ['001'],
    parentJobId:        'M1',
    attempt:            1,
    target:             'main',
    state:              'launching',
    childInstance:      1,
    eventCursor:        { instance: 1, sequence: 0 },
    answeredRequestIds: [],
    crashResumes:       0,
    ...scope,
  };
}

const THE_CROSSING: readonly LogRecord[] = [
  launched('J1', 'build', 'builder', HOME_BUILD),
  ended('J1', 'built'),
  launched('J2', 'build', 'builder', PACKAGE_BUILD),
  ended('J2', 'built'),
  launched('J3', 'review', 'reviewer', PACKAGE_REVIEW),
  ended('J3', 'reviewed'),
  launched('J4', 'review', 'reviewer', HOME_REVIEW),
  ended('J4', 'reviewed'),
];

describe('a crossing ticket\'s Airlock agent', () => {
  test('of the home carries on the ticket\'s last home worker of its stage (E63)', () => {
    const records = [...THE_CROSSING, launched('A1', 'merge-agent', 'reviewer', HOME_REVIEW, 'M1')];

    expect(JobResumption.sessionOwnerJobIdOf(records, airlockAgentOf('A1', 'reviewer', HOME_REVIEW))).toBe('J4');
  });

  test('of a package carries on that package\'s newest build session, though a home review ran after it (E62)', () => {
    const records = [...THE_CROSSING, launched('A1', 'merge-agent', 'builder', PACKAGE_BUILD, 'M1')];

    expect(JobResumption.sessionOwnerJobIdOf(records, airlockAgentOf('A1', 'builder', PACKAGE_BUILD))).toBe('J2');
  });

  test('of a package that never built for the ticket starts a session of its own', () => {
    const records = [...THE_CROSSING, launched('A1', 'merge-agent', 'builder', OTHER_PACKAGE, 'M1')];

    expect(JobResumption.sessionOwnerJobIdOf(records, airlockAgentOf('A1', 'builder', OTHER_PACKAGE))).toBe('A1');
  });
});
