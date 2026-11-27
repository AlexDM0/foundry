/**
 * Hephaestus's jobs on the Board: ids are never reused, since a log line and a child folder name them for good; every move goes through the one
 * legality table, and only `job-ended` finishes a job, which a job whose launch stands refused does on every stop mode, since no session of it will
 * ever end. The cases also cover the product owner's intake, the pipeline agent's session and User's resume.
 */
import { describe, expect, test } from 'bun:test';

import {
  boardFixture,
  refusalDetailOf,
  taskFixture,
  ticketFixture
} from '../../testing/BoardFixtures.ts';
import type {
  InterruptionCause,
  JobLaunch,
  JobMoveTarget,
  JobState
} from './@types/Job.ts';
import type { Pipeline }                            from './@types/Pipeline.ts';
import type { PlaybookStep }                        from './@types/PlaybookStep.ts';
import type { Board }                               from './Board.ts';
import { FRESH_AGENT_CAUSE, STOPPED_BY_USER_CAUSE } from './JobControls.ts';
import type { SteppedJobState }                     from './Jobs.ts';
import { LEGAL_SOURCE_STATES_FOR_JOB_MOVE }         from './constants/JobMoveLegality.ts';
import { JOB_STATES }                               from './constants/JobStates.ts';
import { FIXTURE_LIMITS, FIXTURE_OBSERVATIONS }     from './testing/LifecycleFixtures.ts';

const AT = '2026-09-26T10:15:00+02:00';

const BUILD_LAUNCH: JobLaunch = {
  kind:        'build',
  role:        'builder',
  ticketIds:   ['001'],
  parentJobId: null,
  attempt:     1,
  target:      'main',
};

const MERGE_LAUNCH: JobLaunch = {
  kind:        'merge',
  role:        null,
  ticketIds:   ['001'],
  parentJobId: null,
  attempt:     1,
  target:      'main',
};

/** A path from `launching` to each state, through legal moves only. */
const PATH_TO_STATE: Readonly<Record<JobState, readonly JobMoveTarget[]>> = {
  'launching':          [],
  'preparing':          ['preparing'],
  'running':            ['running'],
  'waiting-for-answer': ['running', 'waiting-for-answer'],
  'interrupted':        ['running', 'interrupted'],
  'awaiting-answer':    ['running', 'interrupted', 'awaiting-answer'],
  'in-customs':         ['running', 'in-customs'],
  'gating':             ['running', 'in-customs', 'gating'],
  'merging-main':       ['running', 'in-customs', 'gating', 'merging-main'],
  'merging':            ['merging'],
  'landing':            ['merging', 'gating', 'landing'],
  'stopping':           ['stopping'],
};

function boardWithTicket(): ReturnType<typeof boardFixture> {
  return boardFixture({ tickets: [ticketFixture({ id: '001', status: 'in-progress' })] });
}

function stepJob(board: Board, jobId: string, target: JobMoveTarget): void {
  if (target === 'interrupted') board.interruptJob(jobId, 'talos-lost', AT);
  else if (target === 'ended') board.endJob(jobId, { outcome: 'failed' }, AT);
  else board.moveJob(jobId, target, AT);
}

function jobInState(board: Board, state: JobState): string {
  const { job } = board.launchJob(PATH_TO_STATE[state][0] === 'merging' ? MERGE_LAUNCH : BUILD_LAUNCH, AT);
  for (const target of PATH_TO_STATE[state]) stepJob(board, job.id, target);
  expect(board.jobById(job.id)?.state).toBe(state);
  return job.id;
}

describe('a launch', () => {
  test('stores the job with what a restart reads, and no process identity', () => {
    const { board, records } = boardWithTicket();
    const { job, logged }    = board.launchJob(BUILD_LAUNCH, AT);

    expect(Object.keys(job)).toEqual([
      'id',
      'kind',
      'role',
      'ticketIds',
      'parentJobId',
      'attempt',
      'target',
      'state',
      'childInstance',
      'eventCursor',
      'answeredRequestIds',
      'crashResumes',
    ]);
    expect(job).toMatchObject({
      id: 'J1', state: 'launching', childInstance: 1, eventCursor: { instance: 1, sequence: 0 }, answeredRequestIds: []
    });
    expect(board.jobs()).toEqual([job]);
    expect(logged).toEqual(records);
    expect(records.map((record) => record.kind)).toEqual(['job-launched']);
  });

  test('takes the next J number, never one an ended job held and never a gap', () => {
    const { board, progress } = boardFixture();
    board.launchJob(BUILD_LAUNCH, AT);
    board.launchJob(BUILD_LAUNCH, AT);
    board.endJob('J2', { outcome: 'failed' }, AT);

    expect(board.launchJob(BUILD_LAUNCH, AT).job.id).toBe('J3');
    expect(progress.nextJobId).toBe(4);
  });

  test('leaves a board that never launched a job without `jobs` or `nextJobId`', () => {
    const { board, progress } = boardWithTicket();
    expect(refusalDetailOf(() => board.moveJob('J1', 'running', AT))).toEqual({ reason: 'unknown-job', jobId: 'J1' });
    expect(Object.hasOwn(progress, 'jobs')).toBe(false);
    expect(Object.hasOwn(progress, 'nextJobId')).toBe(false);
  });
});

describe('a launch\'s entity and stage', () => {
  test('a launch without them logs and stores no such keys; a launch with them logs and stores both', () => {
    const { board, records } = boardWithTicket();
    const plain  = board.launchJob(BUILD_LAUNCH, AT).job;
    const staged = board.launchJob({ ...BUILD_LAUNCH, entity: 'shop', stage: 1 }, AT).job;

    expect(['entity', 'stage'].some((key) => Object.hasOwn(plain, key) || Object.hasOwn(records[0]?.fields ?? {}, key))).toBe(false);
    expect(staged).toMatchObject({ entity: 'shop', stage: 1 });
    expect(records[1]).toMatchObject({ kind: 'job-launched', jobId: 'J2', fields: { entity: 'shop', stage: 1 } });
  });
});

describe('an intake\'s request and title', () => {
  test('a product-owner launch logs User\'s request as intakeText; a launch with no intake logs no such key', () => {
    const { board, records } = boardWithTicket();
    board.launchJob(BUILD_LAUNCH, AT);
    board.startIntake('Alex Example asks for a basket.', [], AT);

    expect(records.map((record) => ('fields' in record ? Object.hasOwn(record.fields, 'intakeText') : false))).toEqual([false, true]);
    expect(records[1]).toMatchObject({ kind: 'job-launched', jobId: 'J2', fields: { intakeText: 'Alex Example asks for a basket.' } });
  });

  test('titleIntake keeps the trimmed title on the job and logs intake-titled; a later title replaces it', () => {
    const { board, records } = boardFixture();
    const { job } = board.startIntake('Alex Example asks for a basket.', [], AT);
    board.titleIntake(job.id, '  Example basket  ', AT);
    const { logged } = board.titleIntake(job.id, 'Example basket and wishlist', AT);

    expect(board.jobById(job.id)?.intake).toEqual({ text: 'Alex Example asks for a basket.', title: 'Example basket and wishlist' });
    expect(logged).toEqual([{
      kind: 'intake-titled', jobId: 'J1', fields: { title: 'Example basket and wishlist' }, at: AT
    }]);
    expect(records.filter((record) => record.kind === 'intake-titled').map((record) => record.fields.title)).toEqual(['Example basket', 'Example basket and wishlist']);
  });

  test('a request with pictures logs them as intakePictures and keeps them on the job; a blank one with none is refused intake-empty', () => {
    const { board, records } = boardFixture();
    const pictures = [{ pictureId: 'a'.repeat(64), name: 'basket-mockup.png' }];
    const { job } = board.startIntake('', pictures, AT);
    expect(board.jobById(job.id)?.intake).toEqual({ text: '', pictures });
    expect(records[0]?.fields).toMatchObject({ intakeText: '', intakePictures: pictures });
    expect(refusalDetailOf(() => board.startIntake('  ', [], AT))).toEqual({ reason: 'intake-empty' });
    expect(records).toHaveLength(1);
  });

  test('a message with pictures to a job that is no product owner is refused pictures-not-taken, ended or live', () => {
    const { board } = boardWithTicket();
    const { job } = board.launchJob(BUILD_LAUNCH, AT);
    const pictures = [{ pictureId: 'a'.repeat(64), name: 'header.png' }];
    expect(refusalDetailOf(() => board.messageJob(job.id, 'Like this.', pictures, AT))).toEqual({ reason: 'pictures-not-taken', jobId: job.id, kind: 'build' });
    board.endJob(job.id, { outcome: 'stopped' }, AT);
    expect(refusalDetailOf(() => board.messageJob(job.id, 'Like this.', pictures, AT))).toEqual({ reason: 'pictures-not-taken', jobId: job.id, kind: 'build' });
  });

  test('an untitled intake stores no title key', () => {
    const { board } = boardFixture();
    const { job } = board.startIntake('Alex Example asks for a basket.', [], AT);
    expect(Object.keys(board.jobById(job.id)?.intake ?? {})).toEqual(['text']);
  });

  test('a build job is refused job-not-intake and a blank title intake-title-empty, with nothing logged', () => {
    const { board, records } = boardWithTicket();
    board.launchJob(BUILD_LAUNCH, AT);
    board.startIntake('Alex Example asks for a basket.', [], AT);
    const recordCount = records.length;

    expect(refusalDetailOf(() => board.titleIntake('J1', 'Example basket', AT))).toEqual({ reason: 'job-not-intake', jobId: 'J1', kind: 'build' });
    expect(refusalDetailOf(() => board.titleIntake('J2', '   ', AT))).toEqual({ reason: 'intake-title-empty', jobId: 'J2' });
    expect(records.length).toBe(recordCount);
    expect(board.jobById('J2')?.intake).toEqual({ text: 'Alex Example asks for a basket.' });
  });

  test('a closed product owner reopened by User\'s message keeps the newest title it was given', () => {
    const { board } = boardFixture();
    const { job } = board.startIntake('Alex Example asks for a basket.', [], AT);
    board.titleIntake(job.id, 'Example basket', AT);
    board.titleIntake(job.id, 'Example basket and wishlist', AT);
    board.endJob(job.id, { outcome: 'closed' }, AT);
    board.messageJob(job.id, 'Add a gift card too.', [], AT);

    expect(board.jobById(job.id)?.intake).toEqual({ text: 'Add a gift card too.', title: 'Example basket and wishlist' });
  });
});

describe('the pipeline agent as a session', () => {
  test('a stop before its session started ends it closed, and User\'s message opens it again in its next child instance', () => {
    const { board, records } = boardFixture();
    const { job } = board.startPipelineAgent(AT);

    board.requestJobStop(job.id, 'stop', AT);
    board.messageJob(job.id, 'Check the test script again.', [], AT);

    expect(records.filter((record) => record.kind === 'job-ended').map((record) => record.fields)).toMatchObject([{ outcome: 'closed' }]);
    expect(board.jobById(job.id)).toMatchObject({ kind: 'pipeline-agent', state: 'running', childInstance: 2 });
    expect(records.at(-1)).toMatchObject({ kind: 'job-reopened', fields: { text: 'Check the test script again.', offeredTicketIds: [] } });
  });

  test('a running one moves to stopping, which its session ending closes', () => {
    const { board } = boardFixture();
    const { job } = board.startPipelineAgent(AT);
    board.moveJob(job.id, 'running', AT);

    board.requestJobStop(job.id, 'stop', AT);

    expect(board.jobById(job.id)?.state).toBe('stopping');
  });

  test('one that ended other than closed is refused job-finished, and opens nothing', () => {
    const { board } = boardFixture();
    const { job } = board.startPipelineAgent(AT);
    board.endJob(job.id, { outcome: 'replaced' }, AT);

    expect(refusalDetailOf(() => board.messageJob(job.id, 'Hello.', [], AT))).toEqual({ reason: 'job-finished', jobId: job.id });
    expect(board.jobById(job.id)).toBeUndefined();
  });
});

describe('the legality table', () => {
  test('names every state once as a key, beside `ended`', () => {
    expect(Object.keys(LEGAL_SOURCE_STATES_FOR_JOB_MOVE).sort()).toEqual([...JOB_STATES, 'ended'].sort());
  });

  // Written from design section 3.2's job diagram, not from the table, so a wrong entry in the table fails here.
  test('allows from each state exactly the moves the design draws', () => {
    const DESIGNED_TARGETS_FROM_STATE: Readonly<Record<JobState, readonly JobMoveTarget[]>> = {
      'launching':          ['preparing', 'running', 'merging', 'stopping', 'ended'],
      'preparing':          ['running', 'interrupted', 'stopping', 'ended'],
      'running':            ['waiting-for-answer', 'interrupted', 'in-customs', 'stopping', 'ended'],
      'waiting-for-answer': ['running', 'interrupted', 'stopping', 'ended'],
      'interrupted':        ['running', 'awaiting-answer', 'stopping', 'ended'],
      'awaiting-answer':    ['running', 'stopping', 'ended'],
      // A red Customs check or gate interrupts the job, so the same session is resumed to fix it.
      'in-customs':         ['gating', 'interrupted', 'stopping', 'ended'],
      'gating':             ['awaiting-answer', 'interrupted', 'landing', 'merging-main', 'stopping', 'ended'],
      // With merge approval on, a green build or review merges the target in; a conflict or a red gate there resumes the same session.
      'merging-main':       ['interrupted', 'stopping', 'ended'],
      'merging':            ['gating', 'stopping', 'ended'],
      'landing':            ['stopping', 'ended'],
      'stopping':           ['interrupted', 'awaiting-answer', 'ended'],
    };
    for (const state of JOB_STATES) {
      const allowedTargets = (Object.keys(LEGAL_SOURCE_STATES_FOR_JOB_MOVE) as JobMoveTarget[])
        .filter((target) => LEGAL_SOURCE_STATES_FOR_JOB_MOVE[target].includes(state));
      expect(allowedTargets.sort(), state).toEqual([...DESIGNED_TARGETS_FROM_STATE[state]].sort());
    }
  });

  // Planted from each state: every target the table does not list for it is refused, and nothing changes.
  test.each(JOB_STATES.map((state) => [state]))('from %s, every move the table does not allow is refused job-move-illegal', (state) => {
    const illegalTargets = (Object.keys(LEGAL_SOURCE_STATES_FOR_JOB_MOVE) as JobMoveTarget[])
      .filter((target) => !LEGAL_SOURCE_STATES_FOR_JOB_MOVE[target].includes(state));
    expect(illegalTargets.length).toBeGreaterThan(0);
    for (const target of illegalTargets) {
      const { board } = boardWithTicket();
      const jobId     = jobInState(board, state);
      expect(refusalDetailOf(() => stepJob(board, jobId, target)), `${state} → ${target}`).toEqual({
        reason:      'job-move-illegal',
        jobId,
        state,
        targetState: target,
      });
      expect(board.jobById(jobId)?.state).toBe(state);
    }
  });

  test.each(JOB_STATES.map((state) => [state]))('from %s, every move the table allows is taken', (state) => {
    const legalTargets = (Object.keys(LEGAL_SOURCE_STATES_FOR_JOB_MOVE) as JobMoveTarget[])
      .filter((target) => LEGAL_SOURCE_STATES_FOR_JOB_MOVE[target].includes(state));
    for (const target of legalTargets) {
      const { board } = boardWithTicket();
      const jobId     = jobInState(board, state);
      stepJob(board, jobId, target);
      expect(board.jobById(jobId)?.state, `${state} → ${target}`).toBe(target === 'ended' ? undefined : target);
    }
  });
});

describe('the moves a job logs', () => {
  test('a move between live states logs nothing: the state lives in progress.json', () => {
    const { board, records } = boardWithTicket();
    const { job }            = board.launchJob(BUILD_LAUNCH, AT);
    for (const target of ['preparing', 'running', 'waiting-for-answer', 'running', 'in-customs', 'gating'] as const satisfies readonly SteppedJobState[]) {
      expect(board.moveJob(job.id, target, AT).logged).toEqual([]);
    }
    expect(records.map((record) => record.kind)).toEqual(['job-launched']);
  });

  test('an interruption records its cause; the resume spawns the next child instance and counts only a crash', () => {
    const { board, records } = boardWithTicket();
    const { job }            = board.launchJob(BUILD_LAUNCH, AT);
    board.moveJob(job.id, 'running', AT);
    board.interruptJob(job.id, 'reboot', AT);
    board.moveJob(job.id, 'running', AT);
    board.interruptJob(job.id, 'agent-crashed', AT);
    board.moveJob(job.id, 'running', AT);

    expect(board.jobById(job.id)).toMatchObject({ childInstance: 3, crashResumes: 1, interruption: 'agent-crashed' });
    expect(records.slice(1).map(({ kind, fields }) => [kind, fields])).toEqual([
      ['job-interrupted', { cause: 'reboot', childInstance: 1 }],
      ['job-resumed', { childInstance: 2, cause: 'reboot' }],
      ['job-interrupted', { cause: 'agent-crashed', childInstance: 2 }],
      ['job-resumed', { childInstance: 3, cause: 'agent-crashed' }],
    ]);
  });

  test.each(['talos-paused', 'lease-ended', 'network-outage'] as const)('a resume after a %s interruption counts no crash', (cause) => {
    const { board, records } = boardWithTicket();
    const { job }            = board.launchJob(BUILD_LAUNCH, AT);
    board.moveJob(job.id, 'running', AT);
    board.interruptJob(job.id, cause, AT);
    board.moveJob(job.id, 'running', AT);

    expect(board.jobById(job.id)).toMatchObject({ childInstance: 2, crashResumes: 0, interruption: cause });
    expect(records.slice(1).map(({ kind, fields }) => [kind, fields])).toEqual([
      ['job-interrupted', { cause, childInstance: 1 }],
      ['job-resumed', { childInstance: 2, cause }],
    ]);
  });

  test('a job awaiting an answer resumes into running in the next child instance', () => {
    const { board } = boardWithTicket();
    const jobId     = jobInState(board, 'awaiting-answer');
    expect(board.moveJob(jobId, 'running', AT).logged.map((record) => record.kind)).toEqual(['job-resumed']);
    expect(board.jobById(jobId)?.childInstance).toBe(2);
  });
});

describe('the end of a job', () => {
  test('takes it off the board in the same change, hands back its outcome and logs job-ended', () => {
    const { board, progress } = boardWithTicket();
    const { job: launched }   = board.launchJob(BUILD_LAUNCH, AT);
    const { job, logged }     = board.endJob(launched.id, { outcome: 'replaced', deniedPermissions: ['WebFetch'] }, AT);

    expect(job.outcome).toBe('replaced');
    expect(progress.jobs).toEqual([]);
    expect(logged.map(({ kind, fields }) => [kind, fields])).toEqual([['job-ended', { outcome: 'replaced', deniedPermissions: ['WebFetch'] }]]);
  });

  test('a finished job refuses every move, every interruption, every end and every record change job-finished', () => {
    const { board } = boardWithTicket();
    board.launchJob(BUILD_LAUNCH, AT);
    board.endJob('J1', { outcome: 'resolved' }, AT);
    const finished = { reason: 'job-finished', jobId: 'J1' } as const;

    for (const target of Object.keys(LEGAL_SOURCE_STATES_FOR_JOB_MOVE) as JobMoveTarget[]) {
      expect(refusalDetailOf(() => stepJob(board, 'J1', target)), target).toEqual(finished);
    }
    expect(refusalDetailOf(() => board.setJobEventCursor('J1', { instance: 1, sequence: 4 }))).toEqual(finished);
    expect(refusalDetailOf(() => board.addAnsweredRequestId('J1', 'request-1'))).toEqual(finished);
    expect(refusalDetailOf(() => board.setJobSlot('J1', null))).toEqual(finished);
  });

  test('an id the board never handed out is unknown, not finished', () => {
    const { board } = boardWithTicket();
    board.launchJob(BUILD_LAUNCH, AT);
    expect(refusalDetailOf(() => board.moveJob('J2', 'running', AT))).toEqual({ reason: 'unknown-job', jobId: 'J2' });
    expect(refusalDetailOf(() => board.moveJob('job-1', 'running', AT))).toEqual({ reason: 'unknown-job', jobId: 'job-1' });
  });
});

describe('a job whose launch stands refused', () => {
  const NOT_LAUNCHED = { cause: 'not-there', programPath: '/opt/example/bin/agent' } as const;

  test.each(['stop', 'wind-down', 'fresh'] as const)('ends on a %s while it runs, since no session of it will ever end', (mode) => {
    const { board, progress } = boardWithTicket();
    const jobId = jobInState(board, 'running');
    board.recordNotLaunched(jobId, NOT_LAUNCHED, AT);
    const { logged } = board.requestJobStop(jobId, mode, AT);
    expect(progress.jobs).toEqual([]);
    const ended = logged.filter((record) => record.kind === 'job-ended');
    expect(ended).toHaveLength(1);
    expect(ended[0]?.fields).toMatchObject(mode === 'fresh' ? { outcome: 'replaced', cause: FRESH_AGENT_CAUSE } : { outcome: 'stopped', cause: STOPPED_BY_USER_CAUSE });
  });
});

describe('what a job carries', () => {
  test('the event cursor, the answered request ids once each, and a slot only while it holds one', () => {
    const { board } = boardWithTicket();
    const { job }   = board.launchJob(MERGE_LAUNCH, AT);
    board.setJobEventCursor(job.id, { instance: 1, sequence: 7 });
    board.addAnsweredRequestId(job.id, 'request-1');
    board.addAnsweredRequestId(job.id, 'request-1');
    board.setJobSlot(job.id, {
      target:    'main',
      targetTip: 'a1b2c3d',
      branchTip: 'b2c3d4e',
      phase:     'merge-in',
    });

    expect(board.jobById(job.id)).toMatchObject({
      eventCursor:        { instance: 1, sequence: 7 },
      answeredRequestIds: ['request-1'],
      airlock:            {
        target: 'main', targetTip: 'a1b2c3d', branchTip: 'b2c3d4e', phase: 'merge-in'
      },
    });
    board.setJobSlot(job.id, null);
    expect(Object.hasOwn(board.jobById(job.id) ?? {}, 'airlock')).toBe(false);
  });
});

describe('the merge-queue mark', () => {
  test('is set on an in-review ticket\'s row and cleared when the row leaves in-review', () => {
    const { board } = boardFixture({
      tasks:   [taskFixture({ id: 1, status: 'in-review', ticket: '001' })],
      tickets: [ticketFixture({ id: '001', status: 'in-review', task: 1 })],
    });
    expect(board.setTicketMergeQueued('001', true, AT)?.mergeQueued).toBe(true);
    expect(board.ticketIsMergeQueued('001')).toBe(true);

    board.moveTicket('001', 'reviewed', { checksLegality: true }, AT);
    expect(board.ticketIsMergeQueued('001')).toBe(false);
    expect(Object.hasOwn(board.tasks()[0] ?? {}, 'mergeQueued')).toBe(false);
  });

  test('is refused on a ticket outside in-review, and clearing it is never refused', () => {
    const { board, progress } = boardWithTicket();
    expect(refusalDetailOf(() => board.setTicketMergeQueued('001', true, AT))).toEqual({
      reason:   'merge-queue-of-a-ticket-not-in-review',
      ticketId: '001',
      status:   'in-progress',
    });
    expect(board.setTicketMergeQueued('001', false, AT)).toBeNull();
    expect(progress.tasks).toEqual([]);
  });
});

describe('the Hephaestus state', () => {
  test('the stored state is the one the Board and its dispatch capacity read', () => {
    const { board, progress } = boardFixture();
    progress.hephaestusState      = 'running';
    expect(board.hephaestusState()).toBe('running');
    expect(board.dispatchCapacity().hephaestusState).toBe('running');
  });
});

const VERIFIED_PIPELINE: Pipeline = {
  version: 5, prepare: [], gates: [{ name: 'verify', run: 'bun run verify' }], phases: { build: ['verify'], review: ['verify'], merge: ['verify'] }, review: { name: 'Review' }
};

/** A board with a pipeline, so nothing but a job's own policy holds its resume, and one in-progress ticket per id. */
function boardWithPipelineAndTickets(ticketIds: readonly string[]): ReturnType<typeof boardFixture> {
  return boardFixture({ tickets: ticketIds.map((id) => ticketFixture({ id, status: 'in-progress' })), pipeline: VERIFIED_PIPELINE });
}

function resumeStepsOfAPass(board: Board): PlaybookStep[] {
  const { steps } = board.followPlaybook({ ...FIXTURE_LIMITS, now: AT }, FIXTURE_OBSERVATIONS, () => ({ questions: [], context: '' }));
  return steps.filter((step) => step.kind === 'resume-job');
}

/** A running build of the ticket, interrupted with each cause in turn and resumed by hand between them. */
function buildInterruptedWith(board: Board, ticketId: string, causes: readonly InterruptionCause[]): string {
  const { job } = board.launchJob({ ...BUILD_LAUNCH, ticketIds: [ticketId] }, AT);
  board.moveJob(job.id, 'running', AT);
  causes.forEach((cause, index) => {
    if (index > 0) board.moveJob(job.id, 'running', AT);
    board.interruptJob(job.id, cause, AT);
  });
  return job.id;
}

describe('User\'s resume of interrupted work', () => {
  test('an instructed resume sets crashResumes to 0 and logs instructed, and the job is then resumed twice by itself after two more crashes', () => {
    const { board, records } = boardWithPipelineAndTickets(['001']);
    const jobId              = buildInterruptedWith(board, '001', ['agent-crashed']);
    for (let crash = 0; crash < FIXTURE_LIMITS.CRASH_RESUMES_BEFORE_WAITING; crash += 1) {
      expect(resumeStepsOfAPass(board)).toEqual([{ kind: 'resume-job', jobId, instructed: false }]);
      board.interruptJob(jobId, 'agent-crashed', AT);
    }
    expect(resumeStepsOfAPass(board)).toEqual([]);

    expect(board.instructResume(jobId, AT).logged).toMatchObject([{ kind: 'job-resume-instructed', jobId, fields: { childInstance: 3 } }]);
    expect(resumeStepsOfAPass(board)).toEqual([{ kind: 'resume-job', jobId, instructed: true }]);
    expect(board.jobById(jobId)).toMatchObject({ state: 'running', crashResumes: 0, childInstance: 4 });
    expect(records.findLast((record) => record.kind === 'job-resumed')?.fields).toEqual({ childInstance: 4, cause: 'agent-crashed', instructed: true });

    for (let crash = 0; crash < FIXTURE_LIMITS.CRASH_RESUMES_BEFORE_WAITING; crash += 1) {
      board.interruptJob(jobId, 'agent-crashed', AT);
      expect(resumeStepsOfAPass(board)).toEqual([{ kind: 'resume-job', jobId, instructed: false }]);
    }
    board.interruptJob(jobId, 'agent-crashed', AT);
    expect(resumeStepsOfAPass(board)).toEqual([]);
    expect(board.jobById(jobId)).toMatchObject({ state: 'interrupted', crashResumes: FIXTURE_LIMITS.CRASH_RESUMES_BEFORE_WAITING });
  });

  test('a resume not instructed logs no instructed field', () => {
    const { board, records } = boardWithPipelineAndTickets(['001']);
    const jobId              = buildInterruptedWith(board, '001', ['agent-crashed']);
    board.moveJob(jobId, 'running', AT);
    expect(records.findLast((record) => record.kind === 'job-resumed')?.fields).toEqual({ childInstance: 2, cause: 'agent-crashed' });
  });

  test('instructResume of a job that is not interrupted is refused job-not-interrupted, with nothing logged', () => {
    const { board, records } = boardWithTicket();
    const jobId              = jobInState(board, 'running');
    const recordCount        = records.length;
    expect(refusalDetailOf(() => board.instructResume(jobId, AT))).toEqual({ reason: 'job-not-interrupted', jobId });
    expect(records).toHaveLength(recordCount);
  });

  test('instructResumeOfEveryWaitingJob logs one record per waiting job and none for a job that resumes by itself', () => {
    const { board }    = boardWithPipelineAndTickets(['001', '002', '003', '004']);
    const rebooted     = buildInterruptedWith(board, '001', ['reboot']);
    buildInterruptedWith(board, '002', ['agent-crashed']);
    const pastTheBound = buildInterruptedWith(board, '003', ['agent-crashed', 'agent-crashed', 'agent-crashed']);
    const outage       = buildInterruptedWith(board, '004', ['network-outage']);

    const { logged } = board.instructResumeOfEveryWaitingJob(FIXTURE_LIMITS, AT);

    expect(logged.map((record) => [record.kind, 'jobId' in record ? record.jobId : null])).toEqual([
      ['job-resume-instructed', rebooted], ['job-resume-instructed', pastTheBound], ['job-resume-instructed', outage],
    ]);
  });

  test('instructResumeOfEveryNetworkOutageJob logs one record per job that ended on a network outage only', () => {
    const { board } = boardWithPipelineAndTickets(['001', '002', '003']);
    const outage    = buildInterruptedWith(board, '001', ['network-outage']);
    buildInterruptedWith(board, '002', ['reboot']);
    buildInterruptedWith(board, '003', ['lease-ended']);

    const { logged } = board.instructResumeOfEveryNetworkOutageJob(AT);

    expect(logged.map((record) => [record.kind, 'jobId' in record ? record.jobId : null])).toEqual([['job-resume-instructed', outage]]);
  });

  test('with nothing waiting, both answer an empty list', () => {
    const { board } = boardWithPipelineAndTickets(['001']);
    buildInterruptedWith(board, '001', ['talos-paused']);
    expect(board.instructResumeOfEveryWaitingJob(FIXTURE_LIMITS, AT).logged).toEqual([]);
    expect(board.instructResumeOfEveryNetworkOutageJob(AT).logged).toEqual([]);
  });
});

describe('a line a start found lost', () => {
  function lostLineWaits(board: Board, jobId: string): boolean {
    const job = board.jobById(jobId);
    return job !== undefined && board.lostLineAwaitsResume(job);
  }

  test('is logged with its kind and cause, and the job keeps its state', () => {
    const { board } = boardWithTicket();
    const jobId     = jobInState(board, 'gating');

    expect(board.recordLineLost(jobId, 'gate', 'forge-crashed', AT).logged).toMatchObject([
      { kind: 'job-line-lost', jobId, fields: { line: 'gate', cause: 'forge-crashed' } },
    ]);
    expect(board.jobById(jobId)?.state).toBe('gating');
  });

  test('an instruction after job-line-lost is accepted, and its line no longer waits', () => {
    const { board } = boardWithTicket();
    const jobId     = jobInState(board, 'preparing');
    board.recordLineLost(jobId, 'install', 'reboot', AT);
    expect(lostLineWaits(board, jobId)).toBe(true);

    expect(board.instructResume(jobId, AT).logged).toMatchObject([{ kind: 'job-resume-instructed', jobId }]);
    expect(lostLineWaits(board, jobId)).toBe(false);
  });

  test('an instruction logged before a later lost line does not count: the second lost line waits again', () => {
    const { board } = boardWithTicket();
    const jobId     = jobInState(board, 'gating');
    board.recordLineLost(jobId, 'gate', 'forge-stopped', AT);
    board.instructResume(jobId, AT);
    board.recordLineLost(jobId, 'gate', 'forge-crashed', AT);

    expect(lostLineWaits(board, jobId)).toBe(true);
  });

  test('a lost line already resumed does not wait again after a later interruption that resumed by itself', () => {
    const { board, records } = boardWithTicket();
    const jobId              = jobInState(board, 'preparing');
    board.recordLineLost(jobId, 'install', 'forge-crashed', AT);
    board.instructResume(jobId, AT);
    board.moveJob(jobId, 'running', AT);
    board.interruptJob(jobId, 'answer-delivery', AT);
    for (const next of ['running', 'in-customs', 'gating'] as const) board.moveJob(jobId, next, AT);
    const recordCount = records.length;

    expect(lostLineWaits(board, jobId)).toBe(false);
    expect(refusalDetailOf(() => board.instructResume(jobId, AT))).toEqual({ reason: 'job-not-interrupted', jobId });
    expect(board.instructResumeOfEveryWaitingJob(FIXTURE_LIMITS, AT).logged).toEqual([]);
    expect(records).toHaveLength(recordCount);
  });

  test('a second instruction once the first one came is refused job-not-interrupted', () => {
    const { board } = boardWithTicket();
    const jobId     = jobInState(board, 'gating');
    board.recordLineLost(jobId, 'gate', 'reboot', AT);
    board.instructResume(jobId, AT);

    expect(refusalDetailOf(() => board.instructResume(jobId, AT))).toEqual({ reason: 'job-not-interrupted', jobId });
  });

  test('instructResumeOfEveryWaitingJob includes a job whose lost line waits and leaves out one already instructed', () => {
    const { board } = boardWithPipelineAndTickets(['001', '002', '003']);
    const rebooted  = buildInterruptedWith(board, '001', ['reboot']);
    const lostGate  = jobInState(board, 'gating');
    board.recordLineLost(lostGate, 'gate', 'forge-crashed', AT);
    const instructedInstall = jobInState(board, 'preparing');
    board.recordLineLost(instructedInstall, 'install', 'reboot', AT);
    board.instructResume(instructedInstall, AT);

    const { logged } = board.instructResumeOfEveryWaitingJob(FIXTURE_LIMITS, AT);

    expect(logged.map((record) => [record.kind, 'jobId' in record ? record.jobId : null])).toEqual([
      ['job-resume-instructed', rebooted], ['job-resume-instructed', lostGate],
    ]);
  });
});

describe('the controls a job offers', () => {
  type JobControl = 'stop' | 'wind-down' | 'fresh' | 'message';

  function controlAccepted(state: JobState, control: JobControl): boolean {
    const { board } = boardWithTicket();
    const jobId = jobInState(board, state);
    try {
      if (control === 'message') board.messageJob(jobId, 'Example message.', [], AT);
      else board.requestJobStop(jobId, control, AT);
      return true;
    } catch {
      return false;
    }
  }

  test.each(JOB_STATES.map((state) => [state]))('from %s, each control offered is accepted and each one not offered is refused', (state) => {
    const { board } = boardWithTicket();
    const offers = board.jobOffersOf(jobInState(board, state));
    expect(offers.stopModes).toEqual(['stop', 'wind-down']);
    expect([offers.takesFresh, offers.takesMessage]).toEqual([true, state !== 'stopping']);
    const offered: Record<JobControl, boolean> = {
      'stop': offers.stopModes.includes('stop'), 'wind-down': offers.stopModes.includes('wind-down'), 'fresh': offers.takesFresh, 'message': offers.takesMessage
    };
    for (const control of ['stop', 'wind-down', 'fresh', 'message'] as const) expect(controlAccepted(state, control), control).toBe(offered[control]);
  });

  test('a job with no ticket takes no fresh agent, as its stop refuses one', () => {
    const { board } = boardWithTicket();
    const { job } = board.launchJob({ ...BUILD_LAUNCH, ticketIds: [] }, AT);
    expect(board.jobOffersOf(job.id).takesFresh).toBe(false);
    expect(refusalDetailOf(() => board.requestJobStop(job.id, 'fresh', AT))).toEqual({ reason: 'job-has-no-ticket', jobId: job.id });
  });
});
