/**
 * The incident an Airlock agent opens when its worktree's denied root cannot be made. What matters: a refusing folder maker gives the
 * reason; the first pass opens one `sandbox-unavailable` incident for the agent's job, and the next pass, still refused, opens no second one
 * while the first stands; a job that left the board opens nothing; and under path rules nothing is made, so nothing is refused.
 */
import { describe, expect, test } from 'bun:test';

import type { Job }                    from '../../lib/tracker-model/@types/Job.ts';
import type { Board }                  from '../../lib/tracker-model/Board.ts';
import { boardFixture, ticketFixture } from '../../testing/BoardFixtures.ts';
import { AirlockSandboxIncident }      from './AirlockSandboxIncident.ts';
import type { FolderMaker }            from './WorkerProfiles.ts';

const AT = '2026-11-03T10:00:00+01:00';
const NEXT_PASS_AT = '2026-11-03T10:00:30+01:00';
const WORKTREE = '/example/worktrees/group-example';

const REFUSING_FOLDER_MAKER: FolderMaker = { makeFolder: () => false };

function airlockAgentScene(): { board: Board; airlockAgent: Readonly<Job> } {
  const { board } = boardFixture({ tickets: [ticketFixture({ id: '001', status: 'in-review', task: 1 })] });
  const { job: airlockAgent } = board.launchJob({
    kind: 'merge-agent', role: 'reviewer', ticketIds: ['001'], parentJobId: null, attempt: 1, target: 'main'
  }, AT);
  return { board, airlockAgent };
}

describe('the Airlock agent sandbox incident', () => {
  test('a refused .claude folder opens sandbox-unavailable once, and the next refused pass opens no second one', () => {
    const { board, airlockAgent } = airlockAgentScene();
    const firstPass = AirlockSandboxIncident.unmadeRootOf(airlockAgent.id, { worktree: WORKTREE, sandboxDenyShape: 'mount-points' }, REFUSING_FOLDER_MAKER);
    if (firstPass === null) throw new Error('the refusing folder maker made the folder');
    AirlockSandboxIncident.openOnce(board, firstPass, AT);
    const secondPass = AirlockSandboxIncident.unmadeRootOf(airlockAgent.id, { worktree: WORKTREE, sandboxDenyShape: 'mount-points' }, REFUSING_FOLDER_MAKER);
    if (secondPass === null) throw new Error('the refusing folder maker made the folder');
    expect(AirlockSandboxIncident.openOnce(board, secondPass, NEXT_PASS_AT)).toEqual([]);
    expect(board.incidents().map((incident) => [incident.kind, incident.jobId, incident.ticketIds, incident.facts, incident.defaultMove])).toEqual([[
      'sandbox-unavailable',
      airlockAgent.id,
      ['001'],
      { step: 'airlock-agent', reason: `the denied folder ${WORKTREE}/.claude could not be made, so it would get no read-only mount` },
      'gate-retry',
    ]]);
  });

  test('an Airlock agent that has left the board opens nothing', () => {
    const { board, airlockAgent } = airlockAgentScene();
    board.endJob(airlockAgent.id, { outcome: 'stopped', cause: 'merge-ended' }, AT);
    expect(AirlockSandboxIncident.openOnce(board, { jobId: airlockAgent.id, reason: 'example reason' }, NEXT_PASS_AT)).toEqual([]);
    expect(board.incidents()).toEqual([]);
  });

  test('under path rules nothing is made, so the refusing folder maker refuses nothing', () => {
    const { airlockAgent } = airlockAgentScene();
    expect(AirlockSandboxIncident.unmadeRootOf(airlockAgent.id, { worktree: WORKTREE, sandboxDenyShape: 'path-rules' }, REFUSING_FOLDER_MAKER)).toBeNull();
  });
});
