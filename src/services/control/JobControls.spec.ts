/**
 * User's job controls and the product owner's intake, applied through the control service to a Board as a hold carries it. What matters:
 * a stop or wind-down holds the job's ticket in the same hold, before any Watcher exists too, and logs its mode; a message to a finished job
 * is refused `job-finished`; an intake is a product-owner job with no ticket; closing it submits its complete drafts in the same hold, to
 * `ready-for-review` while ticket review is on and to `pending` while it is off, and ends the job once no Watcher is live; only User's own
 * `ticket ready` moves a ticket on from `ready-for-review`; a stopped product owner's questions are withdrawn; and past the crash bound a
 * product owner waits on its open question, then a fresh one takes the answers over. An intake title names its job, which User's request
 * must name and a relayed one has stamped.
 */
import { describe, expect, test } from 'bun:test';

import { TicketAcceptanceUtil }                         from '../../adapters/tickets/utils/TicketAcceptanceUtil.ts';
import { OperationRefusalWordingUtil }                  from '../../adapters/utils/OperationRefusalWordingUtil.ts';
import type { Ticket }                                  from '../../lib/tracker-model/@types/Ticket.ts';
import type { Board }                                   from '../../lib/tracker-model/Board.ts';
import type { ControlCommand }                          from '../../shared/@types/ControlCommand.ts';
import { OperationRefusal }                             from '../../shared/OperationRefusal.ts';
import { boardFixture, refusalDetailOf, ticketFixture } from '../../testing/BoardFixtures.ts';
import type { TrackerChange }                           from '../tracker/TrackerPipeline.ts';
import { ControlService }                               from './ControlService.ts';

const AT = '2026-09-26T10:15:00+02:00';

const COMPLETE_BODY = '## Acceptance\nA1. The basket shows its total.\n\n## Brief\nWork in the basket page.\n';

function changeOf(board: Board): TrackerChange {
  // The job and decision appliers read only the Board and the stamp of the hold.
  return { board, at: AT } as unknown as TrackerChange;
}

function apply(board: Board, command: ControlCommand): unknown {
  return ControlService.apply(command, changeOf(board)).result;
}

function loggedKindsOf(result: unknown): string[] {
  return (result as { logged: { kind: string }[] }).logged.map((record) => record.kind);
}

function draftFiledBy(id: string, jobId: string, body = COMPLETE_BODY): Ticket {
  return {
    ...ticketFixture({
      id, status: 'draft', filedByJob: jobId, title: `Example draft ${id}`
    }),
    body
  };
}

function runningBuildBoard(): Board {
  const { board } = boardFixture({ tickets: [ticketFixture({ id: '001', status: 'in-progress' })] });
  const { job } = board.launchJob({
    kind: 'build', role: 'builder', ticketIds: ['001'], parentJobId: null, attempt: 1, target: 'main'
  }, AT);
  board.moveJob(job.id, 'preparing', AT);
  board.moveJob(job.id, 'running', AT);
  return board;
}

describe('job stop and wind-down', () => {
  test('wind-down logs its mode and holds the ticket "wound down by User (J1)" in the same hold, leaving the job running', () => {
    const board = runningBuildBoard();
    const result = apply(board, { kind: 'job-stop', jobId: 'J1', mode: 'wind-down' });

    expect(loggedKindsOf(result)).toEqual(['job-stop-requested', 'ticket-held']);
    expect(board.tickets()[0]?.frontmatter.hold).toBe('wound down by User (J1)');
    expect(board.jobById('J1')).toMatchObject({ state: 'running', stopRequest: 'wind-down' });
  });

  test('stop holds the ticket "stopped by User (J1)" and moves a running job to stopping for the Overseer to stop', () => {
    const board = runningBuildBoard();
    apply(board, { kind: 'job-stop', jobId: 'J1', mode: 'stop' });

    expect(board.tickets()[0]?.frontmatter.hold).toBe('stopped by User (J1)');
    expect(board.jobById('J1')?.state).toBe('stopping');
  });

  test('stop before a Watcher exists holds the ticket and ends the job stopped in the same hold', () => {
    const { board } = boardFixture({ tickets: [ticketFixture({ id: '001' })] });
    board.launchJob({
      kind: 'build', role: 'builder', ticketIds: ['001'], parentJobId: null, attempt: 1, target: 'main'
    }, AT);
    const result = apply(board, { kind: 'job-stop', jobId: 'J1', mode: 'stop' });

    expect(loggedKindsOf(result)).toEqual(['job-stop-requested', 'ticket-held', 'job-ended']);
    expect(board.jobById('J1')).toBeUndefined();
    expect(board.tickets()[0]?.frontmatter.hold).toBe('stopped by User (J1)');
  });

  test('fresh holds nothing, and is refused job-has-no-ticket for a product owner', () => {
    const board = runningBuildBoard();
    apply(board, { kind: 'job-fresh', jobId: 'J1' });
    expect(board.tickets()[0]?.frontmatter.hold).toBeUndefined();
    expect(board.jobById('J1')).toMatchObject({ state: 'stopping', stopRequest: 'fresh' });

    apply(board, { kind: 'intake-start', text: 'A basket' });
    expect(refusalDetailOf(() => apply(board, { kind: 'job-fresh', jobId: 'J2' }))).toEqual({ reason: 'job-has-no-ticket', jobId: 'J2' });
  });

  test('stop --all pauses the board and stops every build, review and product-owner job', () => {
    const board = runningBuildBoard();
    board.setOverseerState('running', AT);
    apply(board, { kind: 'intake-start', text: 'A basket' });
    const result = apply(board, { kind: 'job-stop-all', mode: 'stop' });

    expect(loggedKindsOf(result)).toEqual(['overseer-set', 'job-stop-requested', 'ticket-held', 'job-stop-requested']);
    expect(board.overseerState()).toBe('paused');
    expect(board.jobs().map((job) => job.state)).toEqual(['stopping', 'stopping']);
  });
});

describe('job message', () => {
  test('logs job-messaged with the text for a live job', () => {
    const board = runningBuildBoard();
    const result = apply(board, { kind: 'job-message', jobId: 'J1', text: 'Keep the basket page.' });

    expect((result as { logged: unknown[] }).logged).toEqual([{
      kind: 'job-messaged', jobId: 'J1', fields: { text: 'Keep the basket page.' }, at: AT
    }]);
  });

  test('a finished job, or a session whose input is closing, is refused job-finished, worded by the adapter', () => {
    const board = runningBuildBoard();
    board.endJob('J1', { outcome: 'failed' }, AT);
    expect(refusalDetailOf(() => apply(board, { kind: 'job-message', jobId: 'J1', text: 'Hello' }))).toEqual({ reason: 'job-finished', jobId: 'J1' });

    apply(board, { kind: 'intake-start', text: 'A basket' });
    apply(board, { kind: 'intake-close', jobId: 'J2', proposedDraftSets: [] });
    expect(refusalDetailOf(() => apply(board, { kind: 'job-message', jobId: 'J2', text: 'Hello' }))).toEqual({ reason: 'job-finished', jobId: 'J2' });
  });

  test('a finished reviewer, a closed Assistant and a product owner replaced past its bound are refused job-finished', () => {
    const { board } = boardFixture({ tickets: [ticketFixture({ id: '001', status: 'in-review' })] });
    board.launchJob({
      kind: 'review', role: 'reviewer', ticketIds: ['001'], parentJobId: null, attempt: 1, target: 'main'
    }, AT);
    board.endJob('J1', { outcome: 'reviewed' }, AT);
    board.launchJob({
      kind: 'assistant', role: 'assistant', ticketIds: [], parentJobId: null, attempt: 1, target: null
    }, AT);
    board.endJob('J2', { outcome: 'closed' }, AT);
    apply(board, { kind: 'intake-start', text: 'A basket' });
    // What the refresh past the bound does to the session it replaces.
    board.endJob('J3', { outcome: 'replaced' }, AT);

    for (const jobId of ['J1', 'J2', 'J3']) {
      expect(refusalDetailOf(() => apply(board, { kind: 'job-message', jobId, text: 'Hello' }))).toEqual({ reason: 'job-finished', jobId });
    }
    expect(board.jobs()).toEqual([]);
  });

  test('a closed product owner is reopened: back on the board running its next Watcher instance, the reopening logged with the message', () => {
    const { board } = boardFixture({ tickets: [draftFiledBy('004', 'J1')] });
    apply(board, { kind: 'intake-start', text: 'A basket' });
    board.moveJob('J1', 'running', AT);
    apply(board, { kind: 'intake-close', jobId: 'J1', proposedDraftSets: [] });
    board.endIntakeJob('J1', AT);
    const result = apply(board, { kind: 'job-message', jobId: 'J1', text: 'Add a wishlist too.' });

    expect((result as { logged: unknown[] }).logged).toEqual([{
      kind: 'job-reopened', jobId: 'J1', fields: { watcherInstance: 2, text: 'Add a wishlist too.', offeredTicketIds: ['004'] }, at: AT
    }]);
    expect(board.jobById('J1')).toMatchObject({
      kind: 'product-owner', role: 'product-owner', state: 'running', watcherInstance: 2, eventCursor: { instance: 2, sequence: 0 }
    });
  });

  test('a product owner stopped by User is reopened the same way', () => {
    const { board } = boardFixture();
    apply(board, { kind: 'intake-start', text: 'A basket' });
    apply(board, { kind: 'job-stop', jobId: 'J1', mode: 'stop' });
    board.endIntakeJob('J1', AT);
    apply(board, { kind: 'job-message', jobId: 'J1', text: 'Carry on.' });
    expect(board.jobById('J1')).toMatchObject({ state: 'running', watcherInstance: 2 });
  });
});

describe('intake', () => {
  test('intake-start records a launching product-owner job with no ticket, its request kept on the job', () => {
    const { board } = boardFixture();
    apply(board, { kind: 'intake-start', text: 'A basket' });
    apply(board, { kind: 'intake-start', text: 'A wishlist' });

    expect(board.jobs().map((job) => [job.kind, job.role, job.state, job.ticketIds, job.intake?.text])).toEqual([
      ['product-owner', 'product-owner', 'launching', [], 'A basket'],
      ['product-owner', 'product-owner', 'launching', [], 'A wishlist'],
    ]);
    expect(board.concurrency().agentsInFlight).toBe(0);
  });

  test('intake-title keeps the title on the product owner\'s job and logs intake-titled', () => {
    const { board } = boardFixture();
    apply(board, { kind: 'intake-start', text: 'A basket' });
    expect(loggedKindsOf(apply(board, { kind: 'intake-title', jobId: 'J1', title: 'Example basket' }))).toEqual(['intake-titled']);
    expect(board.jobById('J1')?.intake).toEqual({ text: 'A basket', title: 'Example basket' });
  });

  test('intake-title naming no job is refused intake-title-without-job, worded by the adapter', () => {
    const { board } = boardFixture();
    apply(board, { kind: 'intake-start', text: 'A basket' });
    let refusal: unknown;
    try {
      apply(board, { kind: 'intake-title', title: 'Example basket' });
    } catch (thrown) {
      refusal = thrown;
    }
    expect(refusal).toBeInstanceOf(OperationRefusal);
    expect((refusal as OperationRefusal).detail).toEqual({ kind: 'intake-title-without-job' });
    expect(OperationRefusalWordingUtil.messageOf(refusal as OperationRefusal)).toStartWith('Name the product-owner job whose intake to title, as J4.');
  });

  test('intake close of another kind of job is refused job-not-intake', () => {
    const board = runningBuildBoard();
    expect(refusalDetailOf(() => apply(board, { kind: 'intake-close', jobId: 'J1', proposedDraftSets: [] }))).toEqual({ reason: 'job-not-intake', jobId: 'J1', kind: 'build' });
  });

  test('with ticket review on, as without an approvals key, intake-close moves its complete drafts to ready-for-review with no row', () => {
    const { board, progress } = boardFixture({ tickets: [draftFiledBy('004', 'J1'), draftFiledBy('005', 'J1', ''), draftFiledBy('007', 'J9')] });
    apply(board, { kind: 'intake-start', text: 'A basket' });
    const closed = apply(board, { kind: 'intake-close', jobId: 'J1', proposedDraftSets: [] });

    expect(loggedKindsOf(closed)).toEqual(['ticket-submitted-for-review']);
    expect(board.tickets().map((ticket) => ticket.frontmatter.status)).toEqual(['ready-for-review', 'draft', 'draft']);
    expect(progress.tasks).toEqual([]);
    expect(board.endIntakeJob('J1', AT).logged.map((record) => record.kind)).toEqual(['job-ended']);
    expect(board.decisions()).toEqual([]);
  });

  test('with ticket review off, intake-close readies its complete drafts to pending with their rows; an incomplete one stays a draft', () => {
    const { board, progress } = boardFixture({ tickets: [draftFiledBy('004', 'J1'), draftFiledBy('005', 'J1', ''), draftFiledBy('007', 'J9')] });
    board.setNoGates(AT);
    board.setApproval('tickets', false, AT);
    apply(board, { kind: 'intake-start', text: 'A basket' });
    const closed = apply(board, { kind: 'intake-close', jobId: 'J1', proposedDraftSets: [] });

    expect(loggedKindsOf(closed)).toEqual(['ticket-readied']);
    expect(board.tickets().map((ticket) => ticket.frontmatter.status)).toEqual(['pending', 'draft', 'draft']);
    expect(progress.tasks.map((task) => task.ticket)).toEqual(['004']);
  });

  test('User\'s ticket ready moves a ticket ready for review to pending; a draft-only ready refuses it', () => {
    const { board } = boardFixture({ tickets: [draftFiledBy('004', 'J1')] });
    apply(board, { kind: 'intake-start', text: 'A basket' });
    apply(board, { kind: 'intake-close', jobId: 'J1', proposedDraftSets: [] });

    expect(refusalDetailOf(() => board.readyDraftTickets(['004'], TicketAcceptanceUtil.readinessGapsOf, AT)))
      .toEqual({ reason: 'ready-of-a-ticket-not-in-draft', ticketId: '004', status: 'ready-for-review' });
    expect(loggedKindsOf(apply(board, { kind: 'ticket-ready', ticketReferences: ['4'] }))).toEqual(['ticket-readied']);
    expect(board.tickets()[0]?.frontmatter.status).toBe('pending');
  });

  test('a reopened product owner files and closes again: the second close submits only the draft filed since', () => {
    const { board } = boardFixture({ tickets: [draftFiledBy('004', 'J1'), draftFiledBy('005', 'J1', '')] });
    apply(board, { kind: 'intake-start', text: 'A basket' });
    apply(board, { kind: 'intake-close', jobId: 'J1', proposedDraftSets: [] });
    board.endIntakeJob('J1', AT);
    apply(board, { kind: 'job-message', jobId: 'J1', text: 'Add a wishlist too.' });
    board.fileTicket(draftFiledBy('006', 'J1'), AT);
    const closed = apply(board, { kind: 'intake-close', jobId: 'J1', proposedDraftSets: [] });

    expect(loggedKindsOf(closed)).toEqual(['ticket-submitted-for-review']);
    expect(board.tickets().map((ticket) => [ticket.frontmatter.id, ticket.frontmatter.status])).toEqual([
      ['004', 'ready-for-review'], ['005', 'draft'], ['006', 'ready-for-review'],
    ]);
  });

  test('a stopped product owner withdraws its open questions in the same hold, its drafts staying drafts', () => {
    const { board } = boardFixture({ tickets: [draftFiledBy('004', 'J1')] });
    apply(board, { kind: 'intake-start', text: 'A basket' });
    board.openDecision({
      kind:      'agent-question',
      ticketIds: [],
      jobId:     'J1',
      askedBy:   'product-owner',
      requestId: 'request-1',
      questions: [{
        question: 'Which basket?', header: 'agent-question', multiSelect: false, options: []
      }],
      context: '',
    }, AT);
    const result = apply(board, { kind: 'job-stop', jobId: 'J1', mode: 'stop' });

    expect(loggedKindsOf(result)).toEqual(['job-stop-requested', 'decision-withdrawn']);
    expect(board.decisions()).toEqual([]);
    expect(board.jobById('J1')?.state).toBe('stopping');
    expect(board.tickets()[0]?.frontmatter.status).toBe('draft');
  });
});

describe('moves naming an incident', () => {
  function quietJobBoard(): Board {
    const board = runningBuildBoard();
    board.openIncident({
      kind: 'quiet-job', ticketIds: ['001'], jobId: 'J1', facts: {}, defaultMove: 'open-quiet-job-decision'
    }, AT);
    return board;
  }

  test('job message under an incident its kind allows is logged and marks it handled in the same hold', () => {
    const board  = quietJobBoard();
    const result = apply(board, {
      kind: 'job-message', jobId: 'J1', text: 'Commit what you have.', incidentId: 'I1'
    });
    expect(loggedKindsOf(result)).toEqual(['job-messaged', 'incident-handled']);
    expect(board.incidents()).toEqual([]);
  });

  test('a move the incident\'s kind does not allow is refused incident-move-not-allowed, whoever names it', () => {
    const board = quietJobBoard();
    const refusedDetail = { kind: 'role-command-refused', reason: 'incident-move-not-allowed', commandKind: 'incident-answer' };
    expect(() => apply(board, { kind: 'incident-answer', incidentId: 'I1', text: 'bun' })).toThrow(expect.objectContaining({ detail: refusedDetail }) as Error);
  });

  test.each<[string, ControlCommand]>([
    ['job fresh', { kind: 'job-fresh', jobId: 'J9', incidentId: 'I1' }],
    ['job message', {
      kind: 'job-message', jobId: 'J9', text: 'Go on.', incidentId: 'I1'
    }],
  ])('%s naming a job that is not the incident\'s own is refused and leaves the incident unhandled', (_move, command) => {
    const board = quietJobBoard();
    const refusedDetail = { kind: 'role-command-refused', reason: 'incident-target-mismatch', commandKind: command.kind };
    expect(() => apply(board, command)).toThrow(expect.objectContaining({ detail: refusedDetail }) as Error);
    expect(board.incidents().map((open) => open.id)).toEqual(['I1']);
  });

  test('ticket park naming a ticket the incident does not list is refused and leaves the incident unhandled', () => {
    const board = runningBuildBoard();
    board.openIncident({
      kind: 'out-of-calls', ticketIds: ['001'], jobId: 'J1', facts: {}, defaultMove: 'job-fresh'
    }, AT);
    const command: ControlCommand = {
      kind: 'ticket-park', ticketReference: '9', reason: 'Needs Alex Example', incidentId: 'I1'
    };
    const refusedDetail = { kind: 'role-command-refused', reason: 'incident-target-mismatch', commandKind: 'ticket-park' };
    expect(() => apply(board, command)).toThrow(expect.objectContaining({ detail: refusedDetail }) as Error);
    expect(board.incidents().map((open) => open.id)).toEqual(['I1']);
  });

  test('job message under an incident is refused to a job waiting on User, to one whose ticket has an open agent-question, and to a product owner', () => {
    const waiting = quietJobBoard();
    waiting.moveJob('J1', 'waiting-for-answer', AT);
    expect(refusalDetailOf(() => apply(waiting, {
      kind: 'job-message', jobId: 'J1', text: 'Go on.', incidentId: 'I1'
    })))
      .toEqual({ reason: 'job-awaits-user-answer', jobId: 'J1' });

    const asked = quietJobBoard();
    asked.openDecision({
      kind:      'agent-question',
      ticketIds: ['001'],
      jobId:     null,
      askedBy:   'builder',
      requestId: 'request-1',
      questions: [{
        question: 'Which?', header: 'h', multiSelect: false, options: []
      }],
      context: '',
    }, AT);
    expect(refusalDetailOf(() => apply(asked, {
      kind: 'job-message', jobId: 'J1', text: 'Go on.', incidentId: 'I1'
    })))
      .toEqual({ reason: 'job-awaits-user-answer', jobId: 'J1' });

    const intake = runningBuildBoard();
    intake.startIntake('Alex Example asks for a basket.', AT);
    intake.openIncident({
      kind: 'quiet-job', ticketIds: [], jobId: 'J2', facts: {}, defaultMove: 'open-quiet-job-decision'
    }, AT);
    expect(refusalDetailOf(() => apply(intake, {
      kind: 'job-message', jobId: 'J2', text: 'Go on.', incidentId: 'I1'
    })))
      .toEqual({ reason: 'job-is-product-owner', jobId: 'J2' });
  });

  test('job fresh under a system-question marks it handled and asks for the fresh agent', () => {
    const board = runningBuildBoard();
    board.openIncident({
      kind: 'system-question', ticketIds: ['001'], jobId: 'J1', facts: { requestId: 'request-1' }, defaultMove: 'incident-escalate'
    }, AT);
    expect(loggedKindsOf(apply(board, { kind: 'job-fresh', jobId: 'J1', incidentId: 'I1' }))).toEqual(['job-stop-requested', 'incident-handled']);
  });
});
