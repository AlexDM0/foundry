/**
 * A product owner's `ticket entity` relayed through the Hatch inbox, which builds the job record the Bouncer reads from the Board. What
 * matters: the record lists every ticket in `ready-for-review` or `pending`, whatever job filed it, so the product owner sets the entity of
 * one another job filed, stamped with its own job and logged `by: product-owner`; a ticket already claimed by a builder is out of its reach.
 */
import { expect, test } from 'bun:test';

import { HatchFormatUtil }                                    from '../../adapters/hatch/utils/HatchFormatUtil.ts';
import type { ControlCommandOf }                              from '../../shared/@types/ControlCommand.ts';
import { boardFixture, entityPipelineFixture, ticketFixture } from '../../testing/BoardFixtures.ts';
import type { BoardTransaction }                              from '../tracker/BoardTransaction.ts';
import { HatchInbox }                                         from './HatchInbox.ts';

const AT = '2026-11-17T09:00:00+01:00';

const REPOSITORY_ROOT = '/example/repository';

function assignmentRequestText(requestId: string, ticketReference: string): string {
  const command: ControlCommandOf<'ticket-entity'> = {
    kind: 'ticket-entity', ticketReference, entity: 'web', reason: 'The basket page lives in the web app'
  };
  return JSON.stringify(HatchFormatUtil.requestOf(requestId, command));
}

function productOwnerBoard() {
  const fixture = boardFixture({
    pipeline: entityPipelineFixture(),
    tickets:  [
      ticketFixture({ id: '004', status: 'pending', filedByJob: 'J9' }),
      ticketFixture({ id: '005', status: 'ready-for-review', filedByJob: 'J9' }),
      ticketFixture({ id: '006', status: 'in-progress' }),
    ],
  });
  fixture.board.startIntake('Route the open tickets', [], AT);
  // The cast: applying a request reads only the Board and the stamp of the hold.
  const change = { board: fixture.board, at: AT } as unknown as BoardTransaction;
  return { ...fixture, change };
}

test('a product owner sets the entity of a pending ticket and of a ticket ready for review that another job filed', () => {
  const { board, change, records } = productOwnerBoard();
  const replies = HatchInbox.applyPendingRequests(change, REPOSITORY_ROOT, [
    { jobId: 'J1', requestId: 'R1', text: assignmentRequestText('R1', '4') },
    { jobId: 'J1', requestId: 'R2', text: assignmentRequestText('R2', '5') },
  ]);

  expect(replies.map(({ reply }) => reply.outcome)).toEqual(['done', 'done']);
  expect(board.ticketByReference('004')?.frontmatter.entity).toBe('web');
  expect(board.ticketByReference('005')?.frontmatter.entity).toBe('web');
  expect(records.filter((record) => record.kind === 'entity-assigned').map((record) => [record.ticketId, record.fields])).toEqual([
    ['004', { entity: 'web', reason: 'The basket page lives in the web app', by: 'product-owner' }],
    ['005', { entity: 'web', reason: 'The basket page lives in the web app', by: 'product-owner' }],
  ]);
});

test('a ticket a builder has claimed is refused not-own-draft-or-unclaimed-ticket, and keeps no entity', () => {
  const { board, change } = productOwnerBoard();
  const [refused] = HatchInbox.applyPendingRequests(change, REPOSITORY_ROOT, [{ jobId: 'J1', requestId: 'R1', text: assignmentRequestText('R1', '6') }]);

  expect(refused?.reply).toMatchObject({ outcome: 'refused', detail: { kind: 'role-command-refused', reason: 'not-own-draft-or-unclaimed-ticket', commandKind: 'ticket-entity' } });
  expect(board.ticketByReference('006')?.frontmatter).not.toHaveProperty('entity');
});
