/**
 * The incident an Airlock agent opens when its worktree's denied root cannot be made. What matters: a refusing folder maker gives the
 * reason; the first pass opens one `sandbox-unavailable` incident for the agent's job, and the next pass, still refused, opens no second one
 * while the first stands; a job that left the board opens nothing; a launch closes only its job's launch incident; and under path rules
 * nothing is made, so nothing is refused.
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
const AGENT_CONFIGURATION_FOLDER_NAMES: readonly string[] = ['.claude'];
const MOUNT_POINT_FACTS = { worktree: WORKTREE, sandboxDenyShape: 'mount-points', agentConfigurationFolderNames: AGENT_CONFIGURATION_FOLDER_NAMES } as const;
const PATH_RULE_FACTS = { ...MOUNT_POINT_FACTS, sandboxDenyShape: 'path-rules' } as const;

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
    const firstPass = AirlockSandboxIncident.unmadeRootOf(airlockAgent.id, MOUNT_POINT_FACTS, REFUSING_FOLDER_MAKER);
    if (firstPass === null) throw new Error('the refusing folder maker made the folder');
    AirlockSandboxIncident.openOnce(board, firstPass, AT);
    const secondPass = AirlockSandboxIncident.unmadeRootOf(airlockAgent.id, MOUNT_POINT_FACTS, REFUSING_FOLDER_MAKER);
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

  test('a launch closes the open airlock-agent incident of its job with the default move, and no other incident', () => {
    const { board, airlockAgent } = airlockAgentScene();
    AirlockSandboxIncident.openOnce(board, { jobId: airlockAgent.id, reason: 'example reason' }, AT);
    board.openIncident({
      kind: 'sandbox-unavailable', ticketIds: ['001'], jobId: airlockAgent.id, facts: { step: 'worker', reason: 'example reason' }, defaultMove: 'gate-retry'
    }, AT);
    expect(AirlockSandboxIncident.standsOpenFor(board, airlockAgent.id)).toBe(true);

    const logged = AirlockSandboxIncident.closeOnLaunch(board, airlockAgent.id, NEXT_PASS_AT);

    expect(logged.map((record) => [record.kind, record.fields])).toEqual([['incident-handled', { move: 'gate-retry' }]]);
    expect(board.incidents().map((incident) => incident.facts['step'])).toEqual(['worker']);
    expect(AirlockSandboxIncident.standsOpenFor(board, airlockAgent.id)).toBe(false);
    expect(AirlockSandboxIncident.closeOnLaunch(board, airlockAgent.id, NEXT_PASS_AT)).toEqual([]);
  });

  test('under path rules nothing is made, so the refusing folder maker refuses nothing', () => {
    const { airlockAgent } = airlockAgentScene();
    expect(AirlockSandboxIncident.unmadeRootOf(airlockAgent.id, PATH_RULE_FACTS, REFUSING_FOLDER_MAKER)).toBeNull();
  });
});
