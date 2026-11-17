/**
 * `ticket add` with a network list or an entity, `ticket ready` and `ticket submit` in a forge with entities, and `ticket entity`. What
 * matters: the Board keeps no undo and a relayed filing's hold is stored even when its reply is a refusal, so a network or an entity the
 * filing cannot set is refused before the ticket is filed, leaving no ticket behind for a retry to duplicate. In a forge with entities a
 * ticket without one never reaches `pending`, by `ticket ready` or by a submit with ticket review off, while a submit with review on still
 * waits for review and a forge without entities readies as before. An assignment stamped with a job is the product owner's, any other User's.
 */
import { mkdirSync } from 'node:fs';

import { afterEach, expect, test } from 'bun:test';

import type { Pipeline }         from '../../lib/tracker-model/@types/Pipeline.ts';
import type { Board }            from '../../lib/tracker-model/Board.ts';
import type { ControlCommandOf } from '../../shared/@types/ControlCommand.ts';
import {
  boardFixture,
  entityPipelineFixture,
  refusalDetailOf,
  ticketFixture
} from '../../testing/BoardFixtures.ts';
import { ECHOED_CONTROL_CONTEXT }                         from '../../testing/EchoedControlContext.ts';
import { createScratchDirectory, removeScratchDirectory } from '../../testing/ScratchWorkspace.ts';
import type { TrackerChange }                             from '../tracker/TrackerPipeline.ts';
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

const COMPLETE_BODY = '## Acceptance\n\nA1. The basket keeps its items.\n\n## Brief\nWork belongs in: src/basket/.\n';

function boardWithOneTicket(
  ticket = ticketFixture({ id: '001', status: 'pending' }),
  pipeline: Pipeline | undefined = undefined,
): { board: Board; change: TrackerChange } {
  const root = createScratchDirectory('ticket-controls');
  scratchDirectories.push(root);
  const workspace = workspacePathsFor(root);
  mkdirSync(workspace.ticketsDirectory, { recursive: true });
  const { board } = boardFixture({ tickets: [ticket], ...(pipeline === undefined ? {} : { pipeline }) });
  const change = {
    board, workspace, at: AT, malformedTickets: []
  } as unknown as TrackerChange;
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
