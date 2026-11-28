/**
 * Whose session a crossing ticket's `adapt` stage carries on: the home builder's stage 1 session, never the package builder's; a fresh one
 * on the branch once that resume failed; the `adapt` session that built after a home review that did not hold, or stage 1's when `adapt`
 * was skipped; and never a stage 1 build that did not end `built` or ran another entity.
 */
import { describe, expect, test } from 'bun:test';

import type { Job, JobKind, JobOutcome } from '../../domain/tracker-model/@types/Job.ts';
import type { LogRecord }                from '../../domain/tracker-model/@types/LogRecord.ts';
import { JobResumption }                 from './JobResumption.ts';

const AT = '2026-11-17T18:00:00+01:00';

interface EntityAndStage {
  entity: string;
  stage:  number;
}

const HOME_BUILD: EntityAndStage     = { entity: 'example-app', stage: 1 };
const PACKAGE_BUILD: EntityAndStage  = { entity: 'example-package', stage: 2 };
const PACKAGE_REVIEW: EntityAndStage = { entity: 'example-package', stage: 3 };
const ADAPT: EntityAndStage          = { entity: 'example-app', stage: 4 };
const HOME_REVIEW: EntityAndStage    = { entity: 'example-app', stage: 5 };
const OTHER_APP_BUILD: EntityAndStage = { entity: 'example-other-app', stage: 1 };

function launched(jobId: string, kind: JobKind, scope: EntityAndStage, attempt = 1): LogRecord {
  return {
    at:     AT,
    kind:   'job-launched',
    jobId,
    fields: {
      kind, role: kind === 'build' ? 'builder' : 'reviewer', ticketIds: ['001'], attempt, target: 'main', parentJobId: null, ...scope
    }
  };
}

function ended(jobId: string, outcome: JobOutcome): LogRecord {
  return {
    at: AT, kind: 'job-ended', jobId, fields: { outcome, deniedPermissions: [] }
  };
}

function adaptJobOf(id: string, attempt = 1): Job {
  return {
    id,
    kind:               'build',
    role:               'builder',
    ticketIds:          ['001'],
    parentJobId:        null,
    attempt,
    target:             'main',
    state:              'running',
    childInstance:      1,
    eventCursor:        { instance: 1, sequence: 0 },
    answeredRequestIds: [],
    crashResumes:       0,
    ...ADAPT,
  };
}

const THE_PACKAGE_STAGES: readonly LogRecord[] = [
  launched('J2', 'build', PACKAGE_BUILD), ended('J2', 'built'), launched('J3', 'review', PACKAGE_REVIEW), ended('J3', 'reviewed'),
];

describe('adapt after the package stages', () => {
  test('resumes the home builder\'s stage 1 session, not the package builder\'s (E29, E43)', () => {
    const records = [launched('J1', 'build', HOME_BUILD), ended('J1', 'built'), ...THE_PACKAGE_STAGES, launched('J4', 'build', ADAPT)];

    expect(JobResumption.sessionOwnerJobIdOf(records, adaptJobOf('J4'))).toBe('J1');
  });

  test('resumes the stage 1 session of an earlier attempt', () => {
    const records = [launched('J1', 'build', HOME_BUILD), ended('J1', 'built'), ...THE_PACKAGE_STAGES, launched('J4', 'build', ADAPT, 2)];

    expect(JobResumption.sessionOwnerJobIdOf(records, adaptJobOf('J4', 2))).toBe('J1');
  });

  test('starts fresh once the resume of the stage 1 session failed and its job was replaced (E43)', () => {
    const records = [
      launched('J1', 'build', HOME_BUILD),
      ended('J1', 'built'),
      ...THE_PACKAGE_STAGES,
      launched('J4', 'build', ADAPT),
      ended('J4', 'replaced'),
      launched('J5', 'build', ADAPT),
    ];

    expect(JobResumption.sessionOwnerJobIdOf(records, adaptJobOf('J5'))).toBe('J5');
  });

  test('starts fresh when no stage 1 build of the home entity ended built', () => {
    const records = [launched('J1', 'build', OTHER_APP_BUILD), ended('J1', 'built'), ...THE_PACKAGE_STAGES, launched('J4', 'build', ADAPT)];

    expect(JobResumption.sessionOwnerJobIdOf(records, adaptJobOf('J4'))).toBe('J4');
  });
});

describe('adapt after a home review that did not hold', () => {
  test('carries on the adapt session that built (E51)', () => {
    const records = [
      launched('J1', 'build', HOME_BUILD),
      ended('J1', 'built'),
      ...THE_PACKAGE_STAGES,
      launched('J4', 'build', ADAPT),
      ended('J4', 'built'),
      launched('J5', 'review', HOME_REVIEW),
      ended('J5', 'does-not-hold'),
      launched('J6', 'build', ADAPT),
    ];

    expect(JobResumption.sessionOwnerJobIdOf(records, adaptJobOf('J6'))).toBe('J1');
  });

  test('takes up the stage 1 session when adapt was skipped (E51)', () => {
    const records = [
      launched('J1', 'build', HOME_BUILD),
      ended('J1', 'built'),
      ...THE_PACKAGE_STAGES,
      launched('J5', 'review', HOME_REVIEW),
      ended('J5', 'does-not-hold'),
      launched('J6', 'build', ADAPT),
    ];

    expect(JobResumption.sessionOwnerJobIdOf(records, adaptJobOf('J6'))).toBe('J1');
  });
});
