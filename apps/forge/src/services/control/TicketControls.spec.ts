/**
 * `ticket add` with a network list or an entity, `ticket ready` and `ticket submit` in a forge with entities, and `ticket entity`. What
 * matters: the Board keeps no undo and a relayed filing's hold is stored even when its reply is a refusal, so a network or an entity the
 * filing cannot set is refused before the ticket is filed, leaving no ticket behind for a retry to duplicate. In a forge with entities a
 * ticket without one never reaches `pending`, by `ticket ready` or by a submit with ticket review off, while a submit with review on still
 * waits for review and a forge without entities readies as before. A draft whose Brief names work outside its entity, its whitelisted
 * packages and its `reach` is refused by every filer's move, `ticket ready` and `ticket submit` with review on or off, naming each path,
 * and stays a draft (E85). A research draft needs an entity as any other, and readies in `root` (E84). A worker's finding, which names
 * no entity, is filed for the entity that owns the paths its Brief names, a builder's or a stage 5 reviewer's finding about a package's file
 * for the package (E83, E53), else for its finder job's entity; one whose paths span several owners is judged in the finder's entity and
 * refused before it is filed, as is one that would reach `pending` without an entity, leaving no ticket behind; a forge without entities
 * reads no Brief and files a finding with no entity. An assignment stamped with a job is the product owner's, any other User's. A filed
 * ticket is the one the transaction's records allocate, and a reference to a ticket file the store cannot read finds it by the key the
 * store gives it, the file name's number, so it is refused as malformed rather than as no ticket.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join }                     from 'node:path';

import { afterEach, expect, test } from 'bun:test';

import type { Pipeline }         from '../../lib/tracker-model/@types/Pipeline.ts';
import type { Ticket }           from '../../lib/tracker-model/@types/Ticket.ts';
import type { Board }            from '../../lib/tracker-model/Board.ts';
import { PipelineUtil }          from '../../lib/tracker-model/utils/PipelineUtil.ts';
import type { ControlCommandOf } from '../../shared/@types/ControlCommand.ts';
import { OperationRefusal }      from '../../shared/OperationRefusal.ts';
import {
  boardFixture,
  entityPipelineFixture,
  refusalDetailOf,
  ticketFixture
} from '../../testing/BoardFixtures.ts';
import { ECHOED_CONTROL_CONTEXT }                         from '../../testing/EchoedControlContext.ts';
import { NO_UNREADABLE_RECORDS }                          from '../../testing/FixtureRecordAllocation.ts';
import { createScratchDirectory, removeScratchDirectory } from '../../testing/ScratchWorkspace.ts';
import type { BoardTransaction }                          from '../tracker/BoardTransaction.ts';
import { createLocalRecordAllocation }                    from '../tracker/LocalRecordAllocation.ts';
import { listTickets }                                    from '../tracker/TicketStore.ts';
import { workspacePathsFor }                              from '../tracker/Workspace.ts';
import { ControlService }                                 from './ControlService.ts';

const AT = '2026-11-03T10:00:00+01:00';

const scratchDirectories: string[] = [];

afterEach(() => {
  for (const directory of scratchDirectories.splice(0)) removeScratchDirectory(directory);
});

function filingCommand(network: readonly string[]): ControlCommandOf<'ticket-add'> {
  return {
    kind:          'ticket-add',
    title:         'Example basket page',
    type:          'bug',
    dependsOn:     [],
    epics:         [],
    network:       [...network],
    introducedBy:  null,
    foundInReview: null,
    bodyText:      '## Report\nAlex Example saw the basket empty itself.\n',
  };
}

const COMPLETE_BODY = '## Acceptance\n\nA1. The basket keeps its items.\n\n## Brief\nWork belongs in: apps/web/src/basket/.\n';

function boardWithOneTicket(
  ticket = ticketFixture({ id: '001', status: 'pending' }),
  pipeline: Pipeline | undefined = undefined,
): { board: Board; change: BoardTransaction } {
  const root = createScratchDirectory('ticket-controls');
  scratchDirectories.push(root);
  const workspace = workspacePathsFor(root);
  mkdirSync(workspace.ticketsDirectory, { recursive: true });
  const { board } = boardFixture({ tickets: [ticket], ...(pipeline === undefined ? {} : { pipeline }) });
  const change = {
    board, workspace, at: AT, records: createLocalRecordAllocation(workspace, board, NO_UNREADABLE_RECORDS), unreadableRecords: NO_UNREADABLE_RECORDS
  } as unknown as BoardTransaction;
  return { board, change };
}

test('a filing naming a domain that is not public is refused before the ticket is filed, so no ticket is left behind', () => {
  const { board, change } = boardWithOneTicket();
  expect(refusalDetailOf(() => ControlService.apply(filingCommand(['example.com', 'localhost']), change, ECHOED_CONTROL_CONTEXT)))
    .toEqual({ reason: 'network-domain-not-public', ticketId: '002', domains: ['localhost'] });
  expect(board.tickets().map((ticket) => ticket.frontmatter.id)).toEqual(['001']);
});

test('a filing naming only blank domains is refused as no change before the ticket is filed', () => {
  const { board, change } = boardWithOneTicket();
  expect(refusalDetailOf(() => ControlService.apply(filingCommand([' ']), change, ECHOED_CONTROL_CONTEXT)))
    .toEqual({ reason: 'network-unchanged', ticketId: '002', domains: [] });
  expect(board.tickets().map((ticket) => ticket.frontmatter.id)).toEqual(['001']);
});

test('a filing naming public domains files the ticket with its network set, normalised', () => {
  const { board, change } = boardWithOneTicket();
  ControlService.apply(filingCommand(['Example.COM']), change, ECHOED_CONTROL_CONTEXT);
  expect(board.ticketByReference('002')?.frontmatter.network).toEqual(['example.com']);
});

test('a filing naming an entity in a forge without entities is refused before the ticket is filed', () => {
  const { board, change } = boardWithOneTicket();
  expect(refusalDetailOf(() => ControlService.apply({ ...filingCommand([]), entity: 'web' }, change, ECHOED_CONTROL_CONTEXT)))
    .toEqual({
      reason: 'unknown-entity', ticketId: '002', entity: 'web', entityKeys: []
    });
  expect(board.tickets().map((ticket) => ticket.frontmatter.id)).toEqual(['001']);
});

test('a filing naming an entity of the pipeline files the ticket in it, logging only the filing', () => {
  const { board, change } = boardWithOneTicket(undefined, entityPipelineFixture());
  const applied = ControlService.apply({ ...filingCommand([]), entity: 'web' }, change, ECHOED_CONTROL_CONTEXT);
  expect(board.ticketByReference('002')?.frontmatter.entity).toBe('web');
  expect(applied.result.logged.map((record) => record.kind)).toEqual(['ticket-filed']);
});

test('ticket ready in a forge with entities refuses every named draft without one, naming each, and readies nothing', () => {
  const { board, change } = boardWithOneTicket(ticketFixture({ id: '001', status: 'draft' }), entityPipelineFixture());
  board.fileTicket(ticketFixture({ id: '002', status: 'draft', entity: 'web' }), change.at);
  board.fileTicket(ticketFixture({ id: '003', status: 'draft' }), change.at);
  expect(refusalDetailOf(() => ControlService.apply({ kind: 'ticket-ready', ticketReferences: ['1', '2', '3'] }, change, ECHOED_CONTROL_CONTEXT)))
    .toEqual({ reason: 'ticket-without-entity', ticketIds: ['001', '003'] });
  expect(board.tickets().map((ticket) => ticket.frontmatter.status)).toEqual(['draft', 'draft', 'draft']);
});

test('ticket submit with ticket review off in a forge with entities refuses a complete draft without one; with review on it waits for review', () => {
  const reviewOff = boardWithOneTicket(ticketFixture({ id: '001', status: 'draft' }), { ...entityPipelineFixture(), approvals: { tickets: false } });
  reviewOff.board.editTicket('001', { body: { text: COMPLETE_BODY, appends: false }, allowsPastPending: false }, AT);
  expect(refusalDetailOf(() => ControlService.apply({ kind: 'ticket-submit', ticketReferences: ['1'] }, reviewOff.change, ECHOED_CONTROL_CONTEXT)))
    .toEqual({ reason: 'ticket-without-entity', ticketIds: ['001'] });
  expect(reviewOff.board.ticketByReference('001')?.frontmatter.status).toBe('draft');

  const reviewOn = boardWithOneTicket(ticketFixture({ id: '001', status: 'draft' }), entityPipelineFixture());
  reviewOn.board.editTicket('001', { body: { text: COMPLETE_BODY, appends: false }, allowsPastPending: false }, AT);
  ControlService.apply({ kind: 'ticket-submit', ticketReferences: ['1'] }, reviewOn.change, ECHOED_CONTROL_CONTEXT);
  expect(reviewOn.board.ticketByReference('001')?.frontmatter.status).toBe('ready-for-review');
});

test('ticket ready of a research draft without an entity is refused ticket-without-entity, and of one in the root entity readies it (E84)', () => {
  const researchBody = '## Acceptance\n\nA1. The report names each slow gate.\n\n## Brief\nWork belongs in: docs/research/.\n';
  const { board, change } = boardWithOneTicket(ticketFixture({ id: '001', type: 'research', status: 'draft' }), entityPipelineFixture());
  board.editTicket('001', { body: { text: researchBody, appends: false }, allowsPastPending: false }, AT);
  expect(refusalDetailOf(() => ControlService.apply({ kind: 'ticket-ready', ticketReferences: ['1'] }, change, ECHOED_CONTROL_CONTEXT)))
    .toEqual({ reason: 'ticket-without-entity', ticketIds: ['001'] });
  expect(board.ticketByReference('001')?.frontmatter.status).toBe('draft');

  const researchInRoot = ticketFixture({
    id: '001', type: 'research', status: 'draft', entity: 'root'
  });
  const inRoot = boardWithOneTicket(researchInRoot, entityPipelineFixture());
  inRoot.board.editTicket('001', { body: { text: researchBody, appends: false }, allowsPastPending: false }, AT);
  ControlService.apply({ kind: 'ticket-ready', ticketReferences: ['1'] }, inRoot.change, ECHOED_CONTROL_CONTEXT);
  expect(inRoot.board.ticketByReference('001')?.frontmatter.status).toBe('pending');
});

test('ticket ready readies a draft with an entity in a forge with entities, and a draft without one in a forge without entities', () => {
  const withEntities = boardWithOneTicket(ticketFixture({ id: '001', status: 'draft', entity: 'web' }), entityPipelineFixture());
  withEntities.board.editTicket('001', { body: { text: COMPLETE_BODY, appends: false }, allowsPastPending: false }, AT);
  ControlService.apply({ kind: 'ticket-ready', ticketReferences: ['1'] }, withEntities.change, ECHOED_CONTROL_CONTEXT);
  expect(withEntities.board.ticketByReference('001')?.frontmatter.status).toBe('pending');

  const withoutEntities = boardWithOneTicket(ticketFixture({ id: '001', status: 'draft' }));
  withoutEntities.board.editTicket('001', { body: { text: COMPLETE_BODY, appends: false }, allowsPastPending: false }, AT);
  ControlService.apply({ kind: 'ticket-ready', ticketReferences: ['1'] }, withoutEntities.change, ECHOED_CONTROL_CONTEXT);
  expect(withoutEntities.board.ticketByReference('001')?.frontmatter).not.toHaveProperty('entity');
  expect(withoutEntities.board.ticketByReference('001')?.frontmatter.status).toBe('pending');
});

test('an assignment stamped with a job is logged as the product owner\'s, and one without as User\'s', () => {
  const { board, change } = boardWithOneTicket(undefined, entityPipelineFixture());
  const command = {
    kind: 'ticket-entity', ticketReference: '#1', entity: 'web', reason: 'The basket page lives in the web app'
  } as const;
  const byProductOwner = ControlService.apply({ ...command, jobId: 'J7' }, change, ECHOED_CONTROL_CONTEXT);
  expect(byProductOwner.result.logged[0]?.fields).toEqual({ entity: 'web', reason: 'The basket page lives in the web app', by: 'product-owner' });

  const byUser = ControlService.apply({ ...command, entity: 'root', reason: 'It changes the lockfile' }, change, ECHOED_CONTROL_CONTEXT);
  expect(byUser.result.logged[0]?.fields).toEqual({ entity: 'root', reason: 'It changes the lockfile', by: 'user' });
  expect(board.ticketByReference('001')?.frontmatter.entity).toBe('root');
});

const OUTSIDE_BODY = '## Acceptance\n\nA1. The basket keeps its items.\n\n## Brief\n'
  + 'Work belongs in: `apps/web/src/Basket.ts`, `scripts/Release.ts:12-30` and `packages/design-system/Button.ts`.\n'
  + 'Out of bounds regardless: `apps/admin/`.\n';

/** The web app crossing into the design system, with the lockfile in its reach. */
function webCrossingPipeline(approvals: Pipeline['approvals'] = {}): Pipeline {
  const pipeline = entityPipelineFixture();
  const entities = pipeline.entities ?? {};
  const { web } = entities;
  if (web === undefined) throw new Error('The entity pipeline fixture names the web app.');
  return { ...pipeline, approvals, entities: { ...entities, web: { ...web, whitelist: ['design-system'], reach: ['/bun.lock'] } } };
}

function draftOfWeb(body: string, pipeline: Pipeline): { board: Board; change: BoardTransaction } {
  const fixture = boardWithOneTicket(ticketFixture({ id: '001', status: 'draft', entity: 'web' }), pipeline);
  fixture.board.editTicket('001', { body: { text: body, appends: false }, allowsPastPending: false }, AT);
  return fixture;
}

test('E85: ticket ready refuses a draft whose Brief names work outside its entity, naming the paths, and readies nothing', () => {
  const { board, change } = draftOfWeb(OUTSIDE_BODY, webCrossingPipeline());
  expect(refusalDetailOf(() => ControlService.apply({ kind: 'ticket-ready', ticketReferences: ['1'] }, change, ECHOED_CONTROL_CONTEXT)))
    .toEqual({ reason: 'work-outside-entity', ticketsOutside: [{ ticketId: '001', entity: 'web', paths: ['/scripts/Release.ts'] }] });
  expect(board.ticketByReference('001')?.frontmatter.status).toBe('draft');
});

test('E85: ticket submit refuses work outside the entity with ticket review on and off, and the draft stays a draft', () => {
  for (const tickets of [true, false]) {
    const { board, change } = draftOfWeb(OUTSIDE_BODY, webCrossingPipeline({ tickets }));
    expect(refusalDetailOf(() => ControlService.apply({ kind: 'ticket-submit', ticketReferences: ['1'] }, change, ECHOED_CONTROL_CONTEXT)), String(tickets))
      .toEqual({ reason: 'work-outside-entity', ticketsOutside: [{ ticketId: '001', entity: 'web', paths: ['/scripts/Release.ts'] }] });
    expect(board.ticketByReference('001')?.frontmatter.status).toBe('draft');
  }
});

test('E85: work in the entity\'s homes, a whitelisted package and its reach readies', () => {
  const body = OUTSIDE_BODY.replace('`scripts/Release.ts:12-30`', '`bun.lock`, `/bun.lock`');
  const { board, change } = draftOfWeb(body, webCrossingPipeline());
  ControlService.apply({ kind: 'ticket-ready', ticketReferences: ['1'] }, change, ECHOED_CONTROL_CONTEXT);
  expect(board.ticketByReference('001')?.frontmatter.status).toBe('pending');
});

test('a forge without entities readies a draft whatever files its Brief names', () => {
  const { board, change } = boardWithOneTicket(ticketFixture({ id: '001', status: 'draft' }));
  board.editTicket('001', { body: { text: OUTSIDE_BODY, appends: false }, allowsPastPending: false }, AT);
  ControlService.apply({ kind: 'ticket-ready', ticketReferences: ['1'] }, change, ECHOED_CONTROL_CONTEXT);
  expect(board.ticketByReference('001')?.frontmatter.status).toBe('pending');
});

/** Ticket 001 of the web app with job J1 of `role` running on it, its stage's entity `jobEntity` when given. */
function finderAt(
  pipeline: Pipeline,
  launch: { role: 'builder' | 'reviewer'; jobEntity?: string; stage?: number },
): { board: Board; change: BoardTransaction } {
  const status = launch.role === 'builder' ? 'in-progress' : 'in-review';
  const fixture = boardWithOneTicket(ticketFixture({ id: '001', status, ...(pipeline.entities === undefined ? {} : { entity: 'web' }) }), pipeline);
  fixture.board.setOverseerState('running', AT);
  fixture.board.launchJob({
    kind:        launch.role === 'builder' ? 'build' : 'review',
    role:        launch.role,
    ticketIds:   ['001'],
    parentJobId: null,
    attempt:     1,
    target:      'main',
    ...(launch.jobEntity === undefined ? {} : { entity: launch.jobEntity, stage: launch.stage ?? 1 }),
  }, AT);
  return fixture;
}

/** A finding as the Bouncer admits a worker's filing: low, no entity, stamped with the finder job and its tickets. */
function findingOf(bodyText: string): ControlCommandOf<'ticket-add'> {
  return {
    ...filingCommand([]), priority: 'low', bodyText, admission: { filedByJob: 'J1', finderTicketIds: ['001'] }
  };
}

const DESIGN_SYSTEM_FINDING_BODY = '## Acceptance\n\nA1. The button keeps its focus ring.\n\n## Brief\nWork belongs in: `packages/design-system/Button.ts`.\n';

const UNPLACED_FINDING_BODY = '## Acceptance\n\nA1. The basket keeps its items.\n\n## Brief\nThe basket empties itself on a reload.\n';

function withTicketReviewOff(pipeline: Pipeline): Pipeline {
  return { ...pipeline, approvals: { tickets: false } };
}

test('E85: a worker\'s finding naming work of several entities is judged in its finder\'s entity and refused before it is filed, leaving no ticket', () => {
  const { board, change } = finderAt(webCrossingPipeline(), { role: 'builder', jobEntity: 'web' });
  expect(refusalDetailOf(() => ControlService.apply(findingOf(OUTSIDE_BODY), change, ECHOED_CONTROL_CONTEXT)))
    .toEqual({ reason: 'work-outside-entity', ticketsOutside: [{ ticketId: '002', entity: 'web', paths: ['/scripts/Release.ts'] }] });
  expect(board.tickets().map((ticket) => ticket.frontmatter.id)).toEqual(['001']);
});

test('E83: a web builder\'s finding naming the design system\'s file is filed for the design system, and with ticket review off reaches pending', () => {
  const { board, change } = finderAt(withTicketReviewOff(entityPipelineFixture()), { role: 'builder', jobEntity: 'web' });
  ControlService.apply(findingOf(DESIGN_SYSTEM_FINDING_BODY), change, ECHOED_CONTROL_CONTEXT);
  expect(board.ticketByReference('002')?.frontmatter).toMatchObject({ entity: 'design-system', status: 'pending', dependsOn: ['001'] });
});

test('E83: a finding naming no path is filed for its finder\'s entity, waiting for review with ticket review on', () => {
  const { board, change } = finderAt(entityPipelineFixture(), { role: 'builder', jobEntity: 'web' });
  ControlService.apply(findingOf(UNPLACED_FINDING_BODY), change, ECHOED_CONTROL_CONTEXT);
  expect(board.ticketByReference('002')?.frontmatter).toMatchObject({ entity: 'web', status: 'ready-for-review' });
});

test('E53: a stage 5 reviewer\'s low finding about a package\'s file is filed pending for the package with ticket review off', () => {
  const { board, change } = finderAt(withTicketReviewOff(webCrossingPipeline()), { role: 'reviewer', jobEntity: 'web', stage: 5 });
  ControlService.apply(findingOf(DESIGN_SYSTEM_FINDING_BODY), change, ECHOED_CONTROL_CONTEXT);
  expect(board.ticketByReference('002')?.frontmatter).toMatchObject({ entity: 'design-system', status: 'pending', priority: 'low' });
});

test('a finding that would reach pending without an entity is refused ticket-without-entity before it is filed, leaving no ticket', () => {
  const { board, change } = finderAt(withTicketReviewOff(entityPipelineFixture()), { role: 'builder' });
  expect(refusalDetailOf(() => ControlService.apply(findingOf(UNPLACED_FINDING_BODY), change, ECHOED_CONTROL_CONTEXT)))
    .toEqual({ reason: 'ticket-without-entity', ticketIds: ['002'] });
  expect(board.tickets().map((ticket) => ticket.frontmatter.id)).toEqual(['001']);
});

test('a forge without entities files a worker\'s finding with no entity, whatever paths its Brief names', () => {
  const { board, change } = finderAt(withTicketReviewOff(PipelineUtil.minimalPipelineOf()), { role: 'builder' });
  ControlService.apply(findingOf(DESIGN_SYSTEM_FINDING_BODY), change, ECHOED_CONTROL_CONTEXT);
  expect(board.ticketByReference('002')?.frontmatter).not.toHaveProperty('entity');
  expect(board.ticketByReference('002')?.frontmatter.status).toBe('pending');
});

test('a filed ticket is the ticket the transaction\'s records answered, with the next free id', () => {
  const { board, change } = boardWithOneTicket();
  const answeredTickets: Ticket[] = [];
  const recordingChange: BoardTransaction = {
    ...change,
    records: {
      ...change.records,
      newTicket: (input) => {
        const answered = change.records.newTicket(input);
        answeredTickets.push(answered);
        return answered;
      },
    },
  };

  ControlService.apply(filingCommand([]), recordingChange, ECHOED_CONTROL_CONTEXT);

  expect(answeredTickets.map((ticket) => ticket.frontmatter.id)).toEqual(['002']);
  expect(board.tickets().find((ticket) => ticket.frontmatter.id === '002')).toBe(answeredTickets[0]);
});

/** A readable ticket file holding `id` 006, as the ticket writer stores a draft. */
const TICKET_SIX_TEXT = [
  '---',
  'id: "006"',
  'title: "Example checkout page"',
  'type: "ticket"',
  'status: "draft"',
  'filed: "2026-09-18T09:00:00+02:00"',
  'updated: "2026-09-18T09:00:00+02:00"',
  'started: null',
  'finished: null',
  'delivered: null',
  'abandonedAt: null',
  'task: null',
  '---',
  '',
].join('\n');

/** Ticket 001 on the Board, beside three ticket files the store cannot read, listed and keyed as the local adapter keys them. */
function boardBesideUnreadableTicketFiles(): BoardTransaction {
  const { change } = boardWithOneTicket();
  const { ticketsDirectory } = change.workspace;
  writeFileSync(join(ticketsDirectory, '004-broken-by-hand.md'), 'A hand edit that lost the frontmatter.\n');
  writeFileSync(join(ticketsDirectory, '007.md'), 'A hand edit that lost the frontmatter.\n');
  writeFileSync(join(ticketsDirectory, '005-renamed-by-hand.md'), TICKET_SIX_TEXT);
  return { ...change, unreadableRecords: { ...NO_UNREADABLE_RECORDS, tickets: listTickets(change.workspace).unreadable } };
}

function operationRefusalOf(attempt: () => unknown): OperationRefusal {
  try {
    attempt();
  } catch (error) {
    if (error instanceof OperationRefusal) return error;
    throw error;
  }
  throw new Error('the command was not refused');
}

test.each([
  ['4', '004-broken-by-hand.md'],
  ['#7', '007.md'],
  ['005', '005-renamed-by-hand.md'],
])('a reference %s to a ticket file the store cannot read is unrepaired malformed-ticket-file naming %s', (reference, fileName) => {
  const change     = boardBesideUnreadableTicketFiles();
  const unreadable = change.unreadableRecords.tickets.find(({ location }) => location === join(change.workspace.ticketsDirectory, fileName));
  if (unreadable === undefined) throw new Error(`the store listed no unreadable ${fileName}`);

  const refusal = operationRefusalOf(() => ControlService.apply({ kind: 'ticket-ready', ticketReferences: [reference] }, change, ECHOED_CONTROL_CONTEXT));

  expect(refusal.status).toBe('unrepaired');
  expect(refusal.detail).toEqual({
    kind: 'malformed-ticket-file', filePath: unreadable.location, line: unreadable.line, reason: unreadable.reason
  });
});

test('a reference to the id a renamed file holds finds no ticket: the file answers only for the number its name carries', () => {
  const change = boardBesideUnreadableTicketFiles();

  const refusal = operationRefusalOf(() => ControlService.apply({ kind: 'ticket-ready', ticketReferences: ['6'] }, change, ECHOED_CONTROL_CONTEXT));

  expect(refusal.status).toBe('refused');
  expect(refusal.detail).toEqual({ kind: 'no-readable-ticket', reference: '6' });
});
