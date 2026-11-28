/**
 * User's resume of interrupted work through the control service: a job target logs one instruction; a ticket target lifts its `interrupted:` hold
 * with no count reset; `all` covers both and `network-outage` only that cause's jobs; and with nothing waiting they report `nothing-to-do`, a
 * success, so one control may send them to every forge.
 */
import { describe, expect, test } from 'bun:test';

import type { InterruptionCause }                       from '../../domain/tracker-model/@types/Job.ts';
import type { LogRecord }                               from '../../domain/tracker-model/@types/LogRecord.ts';
import type { Pipeline }                                from '../../domain/tracker-model/@types/Pipeline.ts';
import type { Board }                                   from '../../domain/tracker-model/Board.ts';
import type { ResumeTarget }                            from '../../shared/@types/ControlCommand.ts';
import { OperationRefusal }                             from '../../shared/OperationRefusal.ts';
import { boardFixture, refusalDetailOf, ticketFixture } from '../../testing/BoardFixtures.ts';
import { ECHOED_CONTROL_CONTEXT }                       from '../../testing/EchoedControlContext.ts';
import { NO_UNREADABLE_RECORDS }                        from '../../testing/FixtureRecordAllocation.ts';
import type { BoardTransaction }                        from '../tracker/BoardTransaction.ts';
import { ControlService }                               from './ControlService.ts';

const AT = '2026-11-19T02:15:00+01:00';

const VERIFIED_PIPELINE: Pipeline = {
  version: 5, prepare: [], gates: [{ name: 'verify', run: 'bun run verify' }], phases: { build: ['verify'], review: ['verify'], merge: ['verify'] }, review: { name: 'Review' }
};

interface ResumeFixture {
  board:   Board;
  records: LogRecord[];
}

function boardWithTickets(tickets: readonly { id: string; hold?: string }[]): ResumeFixture {
  const { board, records } = boardFixture({
    tickets:  tickets.map((ticket) => ticketFixture({ ...ticket, status: 'in-progress' })),
    pipeline: VERIFIED_PIPELINE,
  });
  return { board, records };
}

function buildOf(board: Board, ticketId: string, cause: InterruptionCause | null): string {
  const { job } = board.launchJob({
    kind: 'build', role: 'builder', ticketIds: [ticketId], parentJobId: null, attempt: 1, target: 'main'
  }, AT);
  board.moveJob(job.id, 'running', AT);
  if (cause !== null) board.interruptJob(job.id, cause, AT);
  return job.id;
}

function changeOf(board: Board): BoardTransaction {
  // The resume applier reads only the Board, the ticket files that would not parse and the stamp of the hold.
  return { board, at: AT, unreadableRecords: NO_UNREADABLE_RECORDS } as unknown as BoardTransaction;
}

function resume(board: Board, target: ResumeTarget) {
  return ControlService.apply({ kind: 'interrupted-work-resume', target }, changeOf(board), ECHOED_CONTROL_CONTEXT);
}

function kindAndSubjectOf(record: LogRecord): [string, string | null] {
  if ('jobId' in record) return [record.kind, record.jobId];
  if ('ticketId' in record) return [record.kind, record.ticketId];
  return [record.kind, null];
}

function recordsAfter(records: readonly LogRecord[], countBefore: number): [string, string | null][] {
  return records.slice(countBefore).map(kindAndSubjectOf);
}

describe('a job target', () => {
  test('logs one job-resume-instructed at the job\'s child instance', () => {
    const { board, records } = boardWithTickets([{ id: '001' }]);
    const jobId = buildOf(board, '001', 'reboot');
    const countBefore = records.length;

    const applied = resume(board, { jobId });

    expect(applied.outcome).toBe('done');
    expect(records.slice(countBefore)).toMatchObject([{ kind: 'job-resume-instructed', jobId, fields: { childInstance: 1 } }]);
  });

  test('a running job is refused job-not-interrupted, with nothing logged', () => {
    const { board, records } = boardWithTickets([{ id: '001' }]);
    const jobId = buildOf(board, '001', null);
    const countBefore = records.length;

    expect(refusalDetailOf(() => resume(board, { jobId }))).toEqual({ reason: 'job-not-interrupted', jobId });
    expect(records).toHaveLength(countBefore);
  });
});

describe('a ticket target', () => {
  test('instructs its job whose gate line a start found lost', () => {
    const { board, records } = boardWithTickets([{ id: '001' }]);
    const { job } = board.launchJob({
      kind: 'build', role: 'builder', ticketIds: ['001'], parentJobId: null, attempt: 1, target: 'main'
    }, AT);
    for (const state of ['preparing', 'running', 'in-customs', 'gating'] as const) board.moveJob(job.id, state, AT);
    board.recordLineLost(job.id, 'gate', 'forge-crashed', AT);
    const countBefore = records.length;

    expect(resume(board, { ticketReference: '001' }).outcome).toBe('done');
    expect(recordsAfter(records, countBefore)).toEqual([['job-resume-instructed', job.id]]);
  });

  test('lifts an interrupted:merge hold, logging ticket-interrupted-hold-lifted and no ticket-unheld, and instructs its interrupted job', () => {
    const { board, records } = boardWithTickets([{ id: '001', hold: 'interrupted:merge' }]);
    const jobId = buildOf(board, '001', 'forge-crashed');
    const countBefore = records.length;

    resume(board, { ticketReference: '#1' });

    expect(recordsAfter(records, countBefore)).toEqual([['job-resume-instructed', jobId], ['ticket-interrupted-hold-lifted', '001']]);
    expect(records.at(-1)).toMatchObject({ fields: { hold: 'interrupted:merge' } });
    expect(board.ticketByReference('001')?.frontmatter).not.toHaveProperty('hold');
  });

  test('a ticket with only the hold lifts it, and one with only an interrupted job instructs it', () => {
    const { board, records } = boardWithTickets([{ id: '001', hold: 'interrupted:merge' }, { id: '002' }]);
    const jobId = buildOf(board, '002', 'lease-ended');
    const countBefore = records.length;

    resume(board, { ticketReference: '1' });
    resume(board, { ticketReference: '002' });

    expect(recordsAfter(records, countBefore)).toEqual([['ticket-interrupted-hold-lifted', '001'], ['job-resume-instructed', jobId]]);
  });

  test('a ticket with neither, a parked hold and a running job included, is refused ticket-not-interrupted', () => {
    const { board, records } = boardWithTickets([{ id: '001', hold: 'parked:failed-passes' }]);
    buildOf(board, '001', null);
    const countBefore = records.length;

    expect(refusalDetailOf(() => resume(board, { ticketReference: '001' }))).toEqual({ reason: 'ticket-not-interrupted', ticketId: '001' });
    expect(records).toHaveLength(countBefore);
    expect(board.ticketByReference('001')?.frontmatter.hold).toBe('parked:failed-passes');
  });

  test('an unknown ticket is refused as every ticket lookup refuses one', () => {
    const { board } = boardWithTickets([{ id: '001' }]);
    let thrown: unknown = null;
    try {
      resume(board, { ticketReference: '9' });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(OperationRefusal);
    expect((thrown as OperationRefusal).detail).toEqual({ kind: 'no-readable-ticket', reference: '9' });
  });
});

describe('all and network-outage', () => {
  test('all instructs every job that waits and lifts every interrupted: hold, leaving a job that resumes by itself alone', () => {
    const { board, records } = boardWithTickets([{ id: '001' }, { id: '002' }, { id: '003', hold: 'interrupted:merge' }, { id: '004', hold: 'waiting on design' }]);
    const rebooted = buildOf(board, '001', 'reboot');
    buildOf(board, '002', 'talos-paused');
    const countBefore = records.length;

    const applied = resume(board, 'all');

    expect(applied.outcome).toBe('done');
    expect(recordsAfter(records, countBefore)).toEqual([['job-resume-instructed', rebooted], ['ticket-interrupted-hold-lifted', '003']]);
    expect(board.ticketByReference('004')?.frontmatter.hold).toBe('waiting on design');
  });

  test('all lets an Apply a start held interrupted wait for its constitution commit again', () => {
    const { board, records } = boardWithTickets([]);
    const { setupId } = board.openSetup({
      mode: 'update', billing: { mode: 'subscription' }, agent: null, replacesUnreadablePipeline: false, mainConstitution: null, storedAnnotations: []
    }, AT).setup;
    board.editConstitution(setupId, { revision: 0, markdown: '# Rules\n- Name things in full.\n' }, AT);
    board.requestApply(setupId, { draftRevision: 0, resumesBoard: false, mainConstitution: null }, AT);
    board.holdApply(setupId, { reason: 'interrupted', blockingFiles: [] }, AT);
    const countBefore = records.length;

    expect(resume(board, 'all').outcome).toBe('done');

    expect(recordsAfter(records, countBefore)).toEqual([['pipeline-apply-requested', null]]);
    expect(board.pipelineSetup()?.applyRequest).toMatchObject({ state: 'committing', reason: null });
  });

  test('network-outage instructs only the jobs that ended on a network outage', () => {
    const { board, records } = boardWithTickets([{ id: '001' }, { id: '002' }, { id: '003', hold: 'interrupted:merge' }]);
    const outage = buildOf(board, '001', 'network-outage');
    buildOf(board, '002', 'reboot');
    const countBefore = records.length;

    resume(board, 'network-outage');

    expect(recordsAfter(records, countBefore)).toEqual([['job-resume-instructed', outage]]);
  });

  test.each(['all', 'network-outage'] as const)('%s with nothing interrupted is nothing-to-do, a success that logs nothing', (target) => {
    const { board, records } = boardWithTickets([{ id: '001' }]);
    buildOf(board, '001', null);
    const countBefore = records.length;

    expect(resume(board, target)).toEqual({ outcome: 'nothing-to-do', result: { logged: [], changed: false } });
    expect(records).toHaveLength(countBefore);
  });
});
