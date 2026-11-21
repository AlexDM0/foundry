/**
 * A builder's `need declare` relayed through the Hatch inbox, whose job record gives the Bouncer the job's entity. What matters: the builder
 * of an entity's stage has its need kept, stamped with its own job; the builder of a job with no entity, as every job of a forge without
 * entities, is refused `need-outside-an-entity` before the hold, and the board keeps no needs.
 */
import { expect, test } from 'bun:test';

import { HatchFormatUtil }                                    from '../../adapters/hatch/utils/HatchFormatUtil.ts';
import type { JobLaunch }                                     from '../../lib/tracker-model/@types/Job.ts';
import type { ControlCommandOf }                              from '../../shared/@types/ControlCommand.ts';
import { boardFixture, entityPipelineFixture, ticketFixture } from '../../testing/BoardFixtures.ts';
import type { BoardTransaction }                              from '../tracker/BoardTransaction.ts';
import { HatchInbox }                                         from './HatchInbox.ts';

const AT = '2026-11-17T09:00:00+01:00';

const REPOSITORY_ROOT = '/example/repository';

const BODY = '## Acceptance\n\nA1. The web app reads the basket total.\n\n## Brief\n\nAlex Example needs the total.\n';

const BUILD: JobLaunch = {
  kind: 'build', role: 'builder', ticketIds: ['003'], parentJobId: null, attempt: 1, target: 'main'
};

function needRequestText(requestId: string): string {
  const command: ControlCommandOf<'need-declare'> = {
    kind: 'need-declare', entity: 'design-system', title: 'Export the basket total', bodyText: BODY
  };
  return JSON.stringify(HatchFormatUtil.requestOf(requestId, command));
}

function boardWithABuild(launch: JobLaunch) {
  const fixture = boardFixture({ pipeline: entityPipelineFixture(), tickets: [ticketFixture({ id: '003', status: 'in-progress' })] });
  fixture.board.launchJob(launch, AT);
  // The cast: applying a request reads only the Board and the stamp of the hold.
  const change = { board: fixture.board, at: AT } as unknown as BoardTransaction;
  return { ...fixture, change };
}

test('the builder of an entity\'s stage has its need kept, stamped with its own job', () => {
  const { board, change } = boardWithABuild({ ...BUILD, entity: 'web', stage: 1 });
  const [applied] = HatchInbox.applyPendingRequests(change, REPOSITORY_ROOT, [{ jobId: 'J1', requestId: 'R1', text: needRequestText('R1') }]);

  expect(applied?.reply.outcome).toBe('done');
  expect(board.needs()).toEqual([{
    jobId: 'J1', ticketIds: ['003'], entity: 'design-system', title: 'Export the basket total', body: BODY
  }]);
});

test('the builder of a job with no entity is refused need-outside-an-entity, and the board keeps no needs', () => {
  const { board, change, progress } = boardWithABuild(BUILD);
  const [refused] = HatchInbox.applyPendingRequests(change, REPOSITORY_ROOT, [{ jobId: 'J1', requestId: 'R1', text: needRequestText('R1') }]);

  expect(refused?.reply).toMatchObject({ outcome: 'refused', detail: { kind: 'role-command-refused', reason: 'need-outside-an-entity', commandKind: 'need-declare' } });
  expect(board.needs()).toEqual([]);
  expect(Object.hasOwn(progress, 'needs')).toBe(false);
});
