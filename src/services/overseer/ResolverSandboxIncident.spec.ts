/**
 * The incident a resolver opens when its worktree's denied root cannot be made. What matters: a refusing folder maker gives the reason; the
 * first pass opens one `sandbox-unavailable` incident for the resolver's job, and the next pass, still refused, opens no second one while the
 * first stands; a job that left the board opens nothing; and under path rules nothing is made, so nothing is refused.
 */
import { describe, expect, test } from 'bun:test';

import type { Job }                    from '../../lib/tracker-model/@types/Job.ts';
import type { Board }                  from '../../lib/tracker-model/Board.ts';
import { boardFixture, ticketFixture } from '../../testing/BoardFixtures.ts';
import { ResolverSandboxIncident }     from './ResolverSandboxIncident.ts';
import type { FolderMaker }            from './WorkerProfiles.ts';

const AT = '2026-11-03T10:00:00+01:00';
const NEXT_PASS_AT = '2026-11-03T10:00:30+01:00';
const WORKTREE = '/example/worktrees/group-example';

const REFUSING_FOLDER_MAKER: FolderMaker = { makeFolder: () => false };

function resolverScene(): { board: Board; resolver: Readonly<Job> } {
  const { board } = boardFixture({ tickets: [ticketFixture({ id: '001', status: 'in-review', task: 1 })] });
  const { job: resolver } = board.launchJob({
    kind: 'merge-agent', role: 'reviewer', ticketIds: ['001'], parentJobId: null, attempt: 1, target: 'main'
  }, AT);
  return { board, resolver };
}

describe('the resolver sandbox incident', () => {
  test('a refused .claude folder opens sandbox-unavailable once, and the next refused pass opens no second one', () => {
    const { board, resolver } = resolverScene();
    const firstPass = ResolverSandboxIncident.unmadeRootOf(resolver.id, { worktree: WORKTREE, sandboxDenyShape: 'mount-points' }, REFUSING_FOLDER_MAKER);
    if (firstPass === null) throw new Error('the refusing folder maker made the folder');
    ResolverSandboxIncident.openOnce(board, firstPass, AT);
    const secondPass = ResolverSandboxIncident.unmadeRootOf(resolver.id, { worktree: WORKTREE, sandboxDenyShape: 'mount-points' }, REFUSING_FOLDER_MAKER);
    if (secondPass === null) throw new Error('the refusing folder maker made the folder');
    expect(ResolverSandboxIncident.openOnce(board, secondPass, NEXT_PASS_AT)).toEqual([]);
    expect(board.incidents().map((incident) => [incident.kind, incident.jobId, incident.ticketIds, incident.facts, incident.defaultMove])).toEqual([[
      'sandbox-unavailable',
      resolver.id,
      ['001'],
      { step: 'resolver', reason: `the denied folder ${WORKTREE}/.claude could not be made, so it would get no read-only mount` },
      'gate-retry',
    ]]);
  });

  test('a resolver that has left the board opens nothing', () => {
    const { board, resolver } = resolverScene();
    board.endJob(resolver.id, { outcome: 'stopped', cause: 'merge-ended' }, AT);
    expect(ResolverSandboxIncident.openOnce(board, { jobId: resolver.id, reason: 'example reason' }, NEXT_PASS_AT)).toEqual([]);
    expect(board.incidents()).toEqual([]);
  });

  test('under path rules nothing is made, so the refusing folder maker refuses nothing', () => {
    const { resolver } = resolverScene();
    expect(ResolverSandboxIncident.unmadeRootOf(resolver.id, { worktree: WORKTREE, sandboxDenyShape: 'path-rules' }, REFUSING_FOLDER_MAKER)).toBeNull();
  });
});
