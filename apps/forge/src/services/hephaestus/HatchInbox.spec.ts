/**
 * A product owner's `ticket entity` through the Hatch inbox: it reaches any ticket in `ready-for-review` or `committed`, whatever job filed
 * it, but not one a builder claimed; a request whose bytes are not UTF-8 is refused rather than read again on every pass.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname }                  from 'node:path';
import { expect, test }             from 'bun:test';

import { hatchRequestFilePathOf }                             from '../../adapters/hatch/HatchFolder.ts';
import { HatchFormatUtil }                                    from '../../adapters/hatch/utils/HatchFormatUtil.ts';
import type { ControlCommandOf }                              from '../../shared/@types/ControlCommand.ts';
import { boardFixture, entityPipelineFixture, ticketFixture } from '../../testing/BoardFixtures.ts';
import { createScratchDirectory, removeScratchDirectory }     from '../../testing/ScratchWorkspace.ts';
import { documentAgentJobFixture }                            from '../../testing/TicketDocumentFixtures.ts';
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
      ticketFixture({ id: '004', status: 'committed', filedByJob: 'J9' }),
      ticketFixture({ id: '005', status: 'ready-for-review', filedByJob: 'J9' }),
      ticketFixture({ id: '006', status: 'in-progress' }),
    ],
  });
  fixture.board.startIntake('Route the open tickets', [], AT);
  // The cast: applying a request reads only the Board and the stamp of the hold.
  const change = { board: fixture.board, at: AT } as unknown as BoardTransaction;
  return { ...fixture, change };
}

test('a product owner sets the entity of a committed ticket and of a ticket ready for review that another job filed', () => {
  const { board, change, records } = productOwnerBoard();
  const replies = HatchInbox.applyPendingRequests(change, REPOSITORY_ROOT, [
    { jobId: 'J1', requestId: 'R1', reading: HatchFormatUtil.requestReadingOf(assignmentRequestText('R1', '4')) },
    { jobId: 'J1', requestId: 'R2', reading: HatchFormatUtil.requestReadingOf(assignmentRequestText('R2', '5')) },
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
  const reading = HatchFormatUtil.requestReadingOf(assignmentRequestText('R1', '6'));
  const [refused] = HatchInbox.applyPendingRequests(change, REPOSITORY_ROOT, [{ jobId: 'J1', requestId: 'R1', reading }]);

  expect(refused?.reply).toMatchObject({ outcome: 'refused', detail: { kind: 'role-command-refused', reason: 'not-own-draft-or-unclaimed-ticket', commandKind: 'ticket-entity' } });
  expect(board.ticketByReference('006')?.frontmatter).not.toHaveProperty('entity');
});

test('a request whose bytes are not UTF-8 is pending as refused malformed-hatch-request, so it is answered', () => {
  const repositoryRoot = createScratchDirectory('hatch-inbox-not-utf8');
  try {
    const job = documentAgentJobFixture('004', 'spec');
    const requestFilePath = hatchRequestFilePathOf(HatchInbox.hatchDirectoryOf(repositoryRoot, job.id), 'R1');
    mkdirSync(dirname(requestFilePath), { recursive: true });
    writeFileSync(requestFilePath, new Uint8Array([0x7b, 0xff, 0x7d]));
    expect(HatchInbox.pendingRequestsOf(repositoryRoot, [job])).toEqual([
      { jobId: job.id, requestId: 'R1', reading: { verdict: 'refused', reason: 'malformed-hatch-request' } },
    ]);
  } finally {
    removeScratchDirectory(repositoryRoot);
  }
});
