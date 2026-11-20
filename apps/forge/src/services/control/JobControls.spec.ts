/**
 * User's job controls and the product owner's intake, applied through the control service to a Board as a hold carries it. What matters: a
 * stop or wind-down holds the job's ticket in the same hold, before any child exists too, and logs its mode; a message to a finished job
 * is refused `job-finished`; an intake is a product-owner job with no ticket; closing it submits its complete drafts in the same hold, to
 * `ready-for-review` while ticket review is on and to `committed` while it is off, and in a forge with entities refuses one without an
 * entity, and refuses work outside a draft's entity (E85) before the job moves, so a corrected retry closes; and ends the job once no
 * child is live; only User's own `ticket ready` moves a ticket on from `ready-for-review`; a stopped
 * product owner's questions are withdrawn; and past the crash bound a product owner waits on its open question, then a fresh one takes the
 * answers over. An intake title names its job, which User's request must name and a relayed one has stamped. A command's pictures must be
 * in the board's store and at most `PICTURES_PER_MESSAGE_LIMIT`, checked before the Board; only a product owner takes them, and a blank
 * request is refused `intake-empty` unless a picture carries it. Option notes, like a title, name their job; their fields reach the Board
 * as untrusted JSON, which refuses a malformed note in words. A need names its build job too, and its body is read as `ticket ready` reads a
 * draft's.
 */
import {
  afterEach,
  describe,
  expect,
  test
} from 'bun:test';

import { TicketAcceptanceUtil }                  from '../../adapters/tickets/utils/TicketAcceptanceUtil.ts';
import { OperationRefusalWordingUtil }           from '../../adapters/utils/OperationRefusalWordingUtil.ts';
import type { Ticket }                           from '../../lib/tracker-model/@types/Ticket.ts';
import type { Board }                            from '../../lib/tracker-model/Board.ts';
import type { ControlCommand, ControlCommandOf } from '../../shared/@types/ControlCommand.ts';
import { OperationRefusal }                      from '../../shared/OperationRefusal.ts';
import { PICTURES_PER_MESSAGE_LIMIT }            from '../../shared/constants/OverseerLimits.ts';
import {
  boardFixture,
  entityPipelineFixture,
  refusalDetailOf,
  ticketFixture
} from '../../testing/BoardFixtures.ts';
import { ECHOED_CONTROL_CONTEXT }                         from '../../testing/EchoedControlContext.ts';
import { createScratchDirectory, removeScratchDirectory } from '../../testing/ScratchWorkspace.ts';
import type { BoardTransaction }                          from '../tracker/BoardTransaction.ts';
import { PictureStore }                                   from '../tracker/PictureStore.ts';
import { ControlService }                                 from './ControlService.ts';

const AT = '2026-09-26T10:15:00+02:00';

const COMPLETE_BODY = '## Acceptance\nA1. The basket shows its total.\n\n## Brief\nWork in the basket page.\n';

function changeOf(board: Board): BoardTransaction {
  // The job and decision appliers read only the Board and the stamp of the hold.
  return { board, at: AT } as unknown as BoardTransaction;
}

function apply(board: Board, command: ControlCommand): unknown {
  return ControlService.apply(command, changeOf(board), ECHOED_CONTROL_CONTEXT).result;
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

  test('stop before a child exists holds the ticket and ends the job stopped in the same hold', () => {
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

  test('a closed product owner is reopened: back on the board running its next child instance, the reopening logged with the message', () => {
    const { board } = boardFixture({ tickets: [draftFiledBy('004', 'J1')] });
    apply(board, { kind: 'intake-start', text: 'A basket' });
    board.moveJob('J1', 'running', AT);
    apply(board, { kind: 'intake-close', jobId: 'J1', proposedDraftSets: [] });
    board.endIntakeJob('J1', AT);
    const result = apply(board, { kind: 'job-message', jobId: 'J1', text: 'Add a wishlist too.' });

    expect((result as { logged: unknown[] }).logged).toEqual([{
      kind: 'job-reopened', jobId: 'J1', fields: { childInstance: 2, text: 'Add a wishlist too.', offeredTicketIds: ['004'] }, at: AT
    }]);
    expect(board.jobById('J1')).toMatchObject({
      kind: 'product-owner', role: 'product-owner', state: 'running', childInstance: 2, eventCursor: { instance: 2, sequence: 0 }
    });
  });

  test('a product owner stopped by User is reopened the same way', () => {
    const { board } = boardFixture();
    apply(board, { kind: 'intake-start', text: 'A basket' });
    apply(board, { kind: 'job-stop', jobId: 'J1', mode: 'stop' });
    board.endIntakeJob('J1', AT);
    apply(board, { kind: 'job-message', jobId: 'J1', text: 'Carry on.' });
    expect(board.jobById('J1')).toMatchObject({ state: 'running', childInstance: 2 });
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

  test('with ticket review off, intake-close readies its complete drafts to committed with their rows; an incomplete one stays a draft', () => {
    const { board, progress } = boardFixture({ tickets: [draftFiledBy('004', 'J1'), draftFiledBy('005', 'J1', ''), draftFiledBy('007', 'J9')] });
    board.setNoGates(AT);
    board.setApproval('tickets', false, AT);
    apply(board, { kind: 'intake-start', text: 'A basket' });
    const closed = apply(board, { kind: 'intake-close', jobId: 'J1', proposedDraftSets: [] });

    expect(loggedKindsOf(closed)).toEqual(['ticket-committed']);
    expect(board.tickets().map((ticket) => ticket.frontmatter.status)).toEqual(['committed', 'draft', 'draft']);
    expect(progress.tasks.map((task) => task.ticket)).toEqual(['004']);
  });

  test('with ticket review off in a forge with entities, intake-close refuses a complete draft without an entity and readies nothing', () => {
    const draftWithAnEntity = draftFiledBy('004', 'J1');
    draftWithAnEntity.frontmatter.entity = 'web';
    const { board } = boardFixture({ pipeline: { ...entityPipelineFixture(), approvals: { tickets: false } }, tickets: [draftWithAnEntity, draftFiledBy('005', 'J1')] });
    apply(board, { kind: 'intake-start', text: 'A basket' });

    expect(refusalDetailOf(() => apply(board, { kind: 'intake-close', jobId: 'J1', proposedDraftSets: [] })))
      .toEqual({ reason: 'ticket-without-entity', ticketIds: ['005'] });
    expect(board.tickets().map((ticket) => ticket.frontmatter.status)).toEqual(['draft', 'draft']);
  });

  test('with ticket review on, intake-close refuses a draft naming work outside its entity before the job moves, and a corrected retry closes', () => {
    const outsideBody = '## Acceptance\nA1. The basket shows its total.\n\n## Brief\nWork belongs in: `scripts/Release.ts`.\n';
    const draftOfWeb  = draftFiledBy('004', 'J1', outsideBody);
    draftOfWeb.frontmatter.entity = 'web';
    const { board } = boardFixture({ pipeline: entityPipelineFixture(), tickets: [draftOfWeb] });
    apply(board, { kind: 'intake-start', text: 'A basket' });
    const jobStateBefore = board.jobById('J1')?.state;

    expect(refusalDetailOf(() => apply(board, { kind: 'intake-close', jobId: 'J1', proposedDraftSets: [] })))
      .toEqual({ reason: 'work-outside-entity', ticketsOutside: [{ ticketId: '004', entity: 'web', paths: ['/scripts/Release.ts'] }] });
    expect(board.jobById('J1')?.state).toBe(jobStateBefore);
    expect(board.tickets()[0]?.frontmatter.status).toBe('draft');

    board.editTicket('004', { body: { text: COMPLETE_BODY, appends: false }, allowsPastCommitted: false }, AT);
    expect(loggedKindsOf(apply(board, { kind: 'intake-close', jobId: 'J1', proposedDraftSets: [] }))).toContain('ticket-submitted-for-review');
    expect(board.tickets()[0]?.frontmatter.status).toBe('ready-for-review');
  });

  test('User\'s ticket ready moves a ticket ready for review to committed; a draft-only ready refuses it', () => {
    const { board } = boardFixture({ tickets: [draftFiledBy('004', 'J1')] });
    apply(board, { kind: 'intake-start', text: 'A basket' });
    apply(board, { kind: 'intake-close', jobId: 'J1', proposedDraftSets: [] });

    expect(refusalDetailOf(() => board.readyDraftTickets(['004'], TicketAcceptanceUtil.readinessGapsOf, AT)))
      .toEqual({ reason: 'ready-of-a-ticket-not-in-draft', ticketId: '004', status: 'ready-for-review' });
    expect(loggedKindsOf(apply(board, { kind: 'ticket-ready', ticketReferences: ['4'] }))).toEqual(['ticket-committed']);
    expect(board.tickets()[0]?.frontmatter.status).toBe('committed');
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

describe('pictures', () => {
  const scratchDirectories: string[] = [];
  afterEach(() => {
    for (const directory of scratchDirectories.splice(0)) removeScratchDirectory(directory);
  });

  /** A board whose store holds one picture, and the change that applies commands to it with the store's folder. */
  function boardWithStoredPicture(board: Board = boardFixture().board): { board: Board; pictureId: string; applyCommand: (command: ControlCommand) => unknown } {
    const trackerDirectory = createScratchDirectory('job-controls-pictures');
    scratchDirectories.push(trackerDirectory);
    const ownerOnlyFiles = { restrictFolder: () => undefined, restrictFile: () => undefined, isOwnerOnly: () => true };
    const storing = PictureStore.storePicture(ownerOnlyFiles, trackerDirectory, Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    if (storing.verdict !== 'stored') throw new Error('the example picture was not stored');
    const change = { board, at: AT, workspace: { trackerDirectory } } as unknown as BoardTransaction;
    return { board, pictureId: storing.pictureId, applyCommand: (command) => ControlService.apply(command, change, ECHOED_CONTROL_CONTEXT).result };
  }

  function thrownBy(act: () => unknown): unknown {
    try {
      act();
    } catch (thrown) {
      return thrown;
    }
    return null;
  }

  test('an intake request of only a picture is applied: the job keeps the picture and the launch logs it as intakePictures', () => {
    const { board, pictureId, applyCommand } = boardWithStoredPicture();
    const result = applyCommand({ kind: 'intake-start', text: '', pictures: [{ pictureId, name: 'basket-mockup.png' }] });
    expect(board.jobById('J1')?.intake).toEqual({ text: '', pictures: [{ pictureId, name: 'basket-mockup.png' }] });
    expect((result as { logged: { fields: unknown }[] }).logged[0]?.fields).toMatchObject({ intakeText: '', intakePictures: [{ pictureId, name: 'basket-mockup.png' }] });
  });

  test('a blank intake request with no picture is refused intake-empty, worded by the adapter, and launches nothing', () => {
    const { board, applyCommand } = boardWithStoredPicture();
    const boardRefusal = refusalDetailOf(() => applyCommand({ kind: 'intake-start', text: '   ' }));
    expect(boardRefusal).toEqual({ reason: 'intake-empty' });
    expect(OperationRefusalWordingUtil.messageOf(new OperationRefusal('refused', { kind: 'board-refusal', boardRefusal })))
      .toStartWith('The intake request is blank and carries no picture');
    expect(board.jobs()).toEqual([]);
  });

  test('a picture the store does not hold is refused picture-unknown, and one past the limit too-many-pictures, before the Board', () => {
    const { board, pictureId, applyCommand } = boardWithStoredPicture();
    const unknown = thrownBy(() => applyCommand({ kind: 'intake-start', text: 'A basket', pictures: [{ pictureId: 'b'.repeat(64), name: 'gone.png' }] }));
    expect((unknown as OperationRefusal).detail).toEqual({ kind: 'picture-unknown', pictureId: 'b'.repeat(64) });
    const tooMany = Array.from({ length: PICTURES_PER_MESSAGE_LIMIT + 1 }, () => ({ pictureId, name: 'basket-mockup.png' }));
    const refusal = thrownBy(() => applyCommand({ kind: 'intake-start', text: 'A basket', pictures: tooMany }));
    expect((refusal as OperationRefusal).detail).toEqual({ kind: 'too-many-pictures', pictureCount: PICTURES_PER_MESSAGE_LIMIT + 1, limit: PICTURES_PER_MESSAGE_LIMIT });
    expect(OperationRefusalWordingUtil.messageOf(refusal as OperationRefusal)).toStartWith(`The message carries ${PICTURES_PER_MESSAGE_LIMIT + 1} pictures`);
    expect(board.jobs()).toEqual([]);
  });

  test('a message with a picture to a product owner logs it; a message without one logs no pictures key', () => {
    const { pictureId, applyCommand } = boardWithStoredPicture();
    applyCommand({ kind: 'intake-start', text: 'A basket' });
    const withPicture = applyCommand({
      kind: 'job-message', jobId: 'J1', text: 'Like this.', pictures: [{ pictureId, name: 'header.png' }]
    });
    const without = applyCommand({ kind: 'job-message', jobId: 'J1', text: 'And smaller.' });
    expect((withPicture as { logged: { fields: unknown }[] }).logged[0]?.fields).toEqual({ text: 'Like this.', pictures: [{ pictureId, name: 'header.png' }] });
    expect((without as { logged: { fields: unknown }[] }).logged[0]?.fields).toEqual({ text: 'And smaller.' });
  });

  test('a closed product owner reopened by a message with a picture keeps it on the reopening and on the intake', () => {
    const { board, pictureId, applyCommand } = boardWithStoredPicture();
    applyCommand({ kind: 'intake-start', text: 'A basket' });
    board.moveJob('J1', 'running', AT);
    applyCommand({ kind: 'intake-close', jobId: 'J1', proposedDraftSets: [] });
    board.endIntakeJob('J1', AT);
    const result = applyCommand({
      kind: 'job-message', jobId: 'J1', text: 'Like this.', pictures: [{ pictureId, name: 'header.png' }]
    });
    expect((result as { logged: { fields: unknown }[] }).logged[0]?.fields).toMatchObject({ text: 'Like this.', pictures: [{ pictureId, name: 'header.png' }] });
    expect(board.jobById('J1')?.intake?.pictures).toEqual([{ pictureId, name: 'header.png' }]);
  });

  test('a picture to any job but a product owner is refused pictures-not-taken, and nothing is logged', () => {
    const boardWithPictureAndBuild = boardWithStoredPicture(runningBuildBoard());
    const { pictureId, applyCommand } = boardWithPictureAndBuild;
    const { board } = boardWithPictureAndBuild;
    const recordCount = board.logRecordsSoFar().length;
    expect(refusalDetailOf(() => applyCommand({
      kind: 'job-message', jobId: 'J1', text: 'Like this.', pictures: [{ pictureId, name: 'header.png' }]
    })))
      .toEqual({ reason: 'pictures-not-taken', jobId: 'J1', kind: 'build' });
    expect(board.logRecordsSoFar()).toHaveLength(recordCount);
  });

  test('pictures that are no list of { pictureId, name } fail on their shape, as a body lacking a field does', () => {
    const { applyCommand } = boardWithStoredPicture();
    const malformed = { kind: 'intake-start', text: 'A basket', pictures: 'basket.png' } as unknown as ControlCommand;
    expect(thrownBy(() => applyCommand(malformed))).toBeInstanceOf(TypeError);
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
    intake.startIntake('Alex Example asks for a basket.', [], AT);
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

describe('question options', () => {
  test('keeps the notes on the named job and logs nothing', () => {
    const board = runningBuildBoard();
    const applied = apply(board, {
      kind: 'question-options', jobId: 'J1', question: 'Which basket?', options: [{ label: 'Wicker', tradeOff: 'Lighter.' }]
    });
    expect(loggedKindsOf(applied)).toEqual([]);
    expect(board.jobById('J1')?.pendingOptionNotes).toEqual([{ question: 'Which basket?', options: [{ label: 'Wicker', tradeOff: 'Lighter.' }] }]);
  });

  test('naming no job is refused question-options-without-job, worded by the adapter', () => {
    const board = runningBuildBoard();
    let refusal: unknown;
    try {
      apply(board, { kind: 'question-options', question: 'Which basket?', options: [{ label: 'Wicker' }] });
    } catch (thrown) {
      refusal = thrown;
    }
    expect(refusal).toBeInstanceOf(OperationRefusal);
    expect((refusal as OperationRefusal).detail).toEqual({ kind: 'question-options-without-job' });
    expect(OperationRefusalWordingUtil.messageOf(refusal as OperationRefusal)).toStartWith('Name the job whose question the option notes are for, as J4.');
  });

  test('a body whose options are not a list is refused question-options-malformed, as an API body may be', () => {
    const board = runningBuildBoard();
    const command = {
      kind: 'question-options', jobId: 'J1', question: 'Which basket?', options: 'Wicker'
    } as unknown as ControlCommandOf<'question-options'>;
    expect(refusalDetailOf(() => apply(board, command))).toEqual({
      reason: 'question-options-malformed', jobId: 'J1', field: 'options', problem: 'not-a-list'
    });
  });
});

describe('need declare', () => {
  function entityBuildBoard(): Board {
    const { board } = boardFixture({ tickets: [ticketFixture({ id: '001', status: 'in-progress' })], pipeline: entityPipelineFixture() });
    board.launchJob({
      kind: 'build', role: 'builder', ticketIds: ['001'], parentJobId: null, attempt: 1, target: 'main', entity: 'web', stage: 1
    }, AT);
    return board;
  }

  const NEED: ControlCommandOf<'need-declare'> = {
    kind: 'need-declare', jobId: 'J1', entity: 'design-system', title: 'Export the basket total', bodyText: COMPLETE_BODY
  };

  test('keeps the need on the board for the named job and logs nothing', () => {
    const board = entityBuildBoard();
    expect(loggedKindsOf(apply(board, NEED))).toEqual([]);
    expect(board.needs()).toEqual([{
      jobId: 'J1', ticketIds: ['001'], entity: 'design-system', title: 'Export the basket total', body: COMPLETE_BODY
    }]);
  });

  test('a body without a Brief is refused need-incomplete by the readiness reading', () => {
    const board = entityBuildBoard();
    const withoutBrief = { ...NEED, bodyText: '## Acceptance\nA1. The basket shows its total.\n' };
    expect(refusalDetailOf(() => apply(board, withoutBrief))).toEqual({ reason: 'need-incomplete', jobId: 'J1', gaps: ['brief-missing'] });
  });

  test('naming no job is refused need-declare-without-job, worded by the adapter', () => {
    const { jobId: _jobId, ...withoutJob } = NEED;
    let refusal: unknown;
    try {
      apply(entityBuildBoard(), withoutJob);
    } catch (thrown) {
      refusal = thrown;
    }
    expect(refusal).toBeInstanceOf(OperationRefusal);
    expect((refusal as OperationRefusal).detail).toEqual({ kind: 'need-declare-without-job' });
    expect(OperationRefusalWordingUtil.messageOf(refusal as OperationRefusal)).toStartWith('Name the build job that declares the need, as J4.');
  });
});
