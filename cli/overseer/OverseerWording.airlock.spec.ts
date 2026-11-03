/**
 * The first message of a ticket's builder or reviewer resumed into its Airlock. What matters: a conflict names the target tip, the branch
 * tip, the Airlock worktree and every conflicted file; a red merged tree is worded as the red handoff; each says the agent cannot ask and
 * states its call budget; and a fresh agent in place of a session that could not resume is also given the ticket with its Handoff and
 * Review, and its role's full budget.
 */
import { describe, expect, test } from 'bun:test';

import type { Job }                          from '../../src/lib/tracker-model/@types/Job.ts';
import type { AirlockFacts, JobLaunchFacts } from '../../src/services/overseer/DrivePass.ts';
import { DISPATCH_PROTOCOL }                 from '../../src/shared/constants/DispatchProtocol.ts';
import { RED_HANDOFF_RESUME_CALL_BUDGET }    from '../../src/shared/constants/OverseerLimits.ts';
import { OverseerWording }                   from './OverseerWording.ts';

const CONFLICT: AirlockFacts = {
  worktree:        '/example-agency/storefront/.example-worktrees/ticket-012',
  branchTip:       '1111111111111111111111111111111111111111',
  targetTip:       '2222222222222222222222222222222222222222',
  phase:           'resolving',
  conflictedFiles: ['basket.ts', 'checkout.ts'],
  redHandoff:      null,
  resumesSession:  true,
};

const RED: AirlockFacts = {
  ...CONFLICT,
  phase:           'fixing',
  conflictedFiles: [],
  redHandoff:      {
    kind:                'gate',
    name:                'verify',
    command:             'bun run verify',
    fixCommand:          null,
    commit:              '3333333333333333333333333333333333333333',
    exitCode:            null,
    batonPassPath:       '/example-agency/jobs/J8/baton-pass.md',
    fullLogPath:         null,
    resume:              1,
    resumesAllowed:      2,
    callBudget:          RED_HANDOFF_RESUME_CALL_BUDGET,
    interruptedInstance: 0,
  },
};

const TICKET_BODY = '## Acceptance\nA1. Example basket adds up.\n\n## Handoff\nExample handoff.\n\n## Review 1\nExample review.';

function messageOf(airlock: AirlockFacts, role: 'builder' | 'reviewer' = 'reviewer'): string {
  const facts = {
    tickets:                [{ id: '012', title: 'Example basket total', body: TICKET_BODY }],
    checksLine:             'bun run verify',
    gates:                  [{ name: 'verify', run: 'bun run verify' }],
    earlierSessionReplaced: false,
    intake:                 null,
    airlock,
    assistant:              null,
    instructions:           '',
    confinement:            'confined',
  } as JobLaunchFacts;
  const job = {
    id: 'J9', kind: 'merge-agent', role, ticketIds: ['012'], parentJobId: 'J8', attempt: 1, target: 'main'
  } as unknown as Readonly<Job>;
  return OverseerWording.launchTextOf(job, facts).firstMessage;
}

describe('a resumed agent on a conflict', () => {
  const message = messageOf(CONFLICT);

  test('is told the target tip, the branch tip, the Airlock worktree and every conflicted file, no placeholder left', () => {
    for (const fact of ['#012', CONFLICT.targetTip, CONFLICT.branchTip, CONFLICT.worktree, '- basket.ts', '- checkout.ts']) expect(message).toContain(fact);
    expect(message).not.toMatch(/\{\{\w+\}\}/);
  });

  test('is told it cannot ask User and has the red handoff call budget', () => {
    expect(message).toContain('AskUserQuestion is not available');
    expect(message).toContain(`You have ${RED_HANDOFF_RESUME_CALL_BUDGET} calls`);
    expect(message).not.toContain('Example handoff.');
  });
});

describe('a resumed agent on a red merged tree', () => {
  test('is given the red handoff of the merged tree', () => {
    const message = messageOf(RED);
    expect(message).toContain('verify');
    expect(message).toContain(RED.redHandoff?.commit ?? '');
    expect(message).not.toMatch(/\{\{\w+\}\}/);
  });
});

describe('a fresh agent in place of a session that could not resume', () => {
  test.each([['builder', DISPATCH_PROTOCOL.BUILDER_API_CALL_BUDGET], ['reviewer', DISPATCH_PROTOCOL.REVIEWER_API_CALL_BUDGET]] as const)(
    'as %s is given the ticket with its Handoff and Review, and its role\'s budget of %d calls',
    (role, callBudget) => {
      const message = messageOf({ ...CONFLICT, resumesSession: false }, role);
      for (const part of ['Example handoff.', 'Example review.', `You have ${callBudget} calls`]) expect(message).toContain(part);
    },
  );
});
