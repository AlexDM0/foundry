/**
 * `ticket add` with a network list. What matters: the Board keeps no undo and a relayed filing's hold is stored even when its reply is a
 * refusal, so a network the filing cannot set is refused before the ticket is filed, leaving no ticket behind for a retry to duplicate;
 * a public list files the ticket with its network set.
 */
import { mkdirSync } from 'node:fs';

import { afterEach, expect, test } from 'bun:test';

import type { Board }                                     from '../../lib/tracker-model/Board.ts';
import type { ControlCommandOf }                          from '../../shared/@types/ControlCommand.ts';
import { boardFixture, refusalDetailOf, ticketFixture }   from '../../testing/BoardFixtures.ts';
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

function boardWithOneTicket(): { board: Board; change: TrackerChange } {
  const root = createScratchDirectory('ticket-controls');
  scratchDirectories.push(root);
  const workspace = workspacePathsFor(root);
  mkdirSync(workspace.ticketsDirectory, { recursive: true });
  const { board } = boardFixture({ tickets: [ticketFixture({ id: '001', status: 'pending' })] });
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
