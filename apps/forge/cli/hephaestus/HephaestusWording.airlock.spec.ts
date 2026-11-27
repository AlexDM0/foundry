/**
 * The first message of a ticket's last worker resumed into its Airlock, and of a conflict re-reviewer: the conflict or red tree it must fix, that
 * it cannot ask, its call budget, and for a fresh agent its role's instruction files and the ticket. A package builder resolving its part is told
 * to stage only and leave the merge open.
 */
import { describe, expect, test } from 'bun:test';

import type { Job }                          from '../../src/lib/tracker-model/@types/Job.ts';
import type { AirlockFacts, JobLaunchFacts } from '../../src/services/hephaestus/DrivePass.ts';
import { DISPATCH_PROTOCOL }                 from '../../src/shared/constants/DispatchProtocol.ts';
import { RED_HANDOFF_RESUME_CALL_BUDGET }    from '../../src/shared/constants/HephaestusLimits.ts';
import { fakeAgentAdapter }                  from '../../src/testing/FakeAgentAdapter.ts';
import { HephaestusWording }                 from './HephaestusWording.ts';

const PROMPT_FILLS = fakeAgentAdapter().promptFills;

const CONFLICT: AirlockFacts = {
  mergePlacement:  'airlock',
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
    gateFailureNotePath: '/example-agency/jobs/J8/gate-failure.md',
    fullLogPath:         null,
    resume:              1,
    resumesAllowed:      2,
    callBudget:          RED_HANDOFF_RESUME_CALL_BUDGET,
    interruptedInstance: 0,
  },
};

const TICKET_BODY = '## Acceptance\nA1. Example basket adds up.\n\n## Handoff\nExample handoff.\n\n## Review 1\nExample review.';

function messageOf(airlock: AirlockFacts, role: Job['role'] = 'reviewer', instructions = '', promptFills = PROMPT_FILLS): string {
  const facts = {
    tickets: [{
      id: '012', title: 'Example basket total', body: TICKET_BODY, branch: 'ticket-012'
    }],
    checksLine:             'bun run verify',
    gates:                  [{ name: 'verify', run: 'bun run verify' }],
    earlierSessionReplaced: false,
    intake:                 null,
    airlock,
    assistant:              null,
    instructions,
    confinement:            'confined',
  } as JobLaunchFacts;
  const job = {
    id: 'J9', kind: 'merge-agent', role, ticketIds: ['012'], parentJobId: 'J8', attempt: 1, target: 'main'
  } as unknown as Readonly<Job>;
  return HephaestusWording.launchTextOf(job, facts, promptFills).firstMessage;
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

describe('a package\'s builder on its part of a crossing ticket\'s conflict', () => {
  const message = messageOf({ ...CONFLICT, conflictedFiles: ['packages/tokens/Colour.ts'], leavesTheMergeOpen: true }, 'builder');

  test('is told to resolve and stage its files only and to leave the merge open for the worker after it (E64)', () => {
    for (const fact of ['#012', CONFLICT.targetTip, CONFLICT.branchTip, CONFLICT.worktree, '- packages/tokens/Colour.ts']) expect(message).toContain(fact);
    expect(message).toContain('Do not commit the merge');
    expect(message).not.toContain('Commit the merge as it stands');
    expect(message).not.toMatch(/\{\{\w+\}\}/);
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

describe('the instruction files of the role an Airlock agent stands in for', () => {
  const instructions = 'You work on ticket #{{ticketId}} as job {{jobId}}, with {{callBudget}} calls.';

  test.each([['builder', DISPATCH_PROTOCOL.BUILDER_API_CALL_BUDGET], ['reviewer', DISPATCH_PROTOCOL.REVIEWER_API_CALL_BUDGET]] as const)(
    'a fresh agent as %s reads them first, filled with its role\'s budget of %d calls',
    (role, callBudget) => {
      const message = messageOf({ ...CONFLICT, resumesSession: false }, role, instructions);
      expect(message.startsWith(`You work on ticket #012 as job J9, with ${callBudget} calls.`)).toBe(true);
      expect(message).not.toMatch(/\{\{\w+\}\}/);
    },
  );

  test('a resumed session is not given them again: it read them at its own launch', () => {
    expect(messageOf(CONFLICT, 'builder', instructions)).not.toContain('You work on ticket');
  });
});

describe('a conflict re-reviewer in the Airlock', () => {
  const instructions = 'You review ticket #{{ticketId}}, round {{round}}, as job {{jobId}}, with {{callBudget}} calls.\n\n{{ticketBody}}';
  const message = messageOf({ ...CONFLICT, phase: 're-reviewing', resumesSession: false }, 'conflict-re-reviewer', instructions);

  test('reads its instruction files filled as a first review round\'s, the ticket among them, then the re-review of the resolution', () => {
    expect(message).toContain(`You review ticket #012, round 1, as job J9, with ${DISPATCH_PROTOCOL.REVIEWER_API_CALL_BUDGET} calls.`);
    expect(message).toContain('Example basket adds up.');
    expect(message.indexOf('Example basket adds up.')).toBeLessThan(message.indexOf('conflict re-reviewer, job J9'));
    for (const fact of [CONFLICT.targetTip, CONFLICT.branchTip, CONFLICT.worktree, '- basket.ts', '- checkout.ts']) expect(message).toContain(fact);
    expect(message).not.toMatch(/\{\{\w+\}\}/);
  });

  test('is told it cannot ask User, proposes no waiver, and has the reviewer\'s budget', () => {
    expect(message).toContain('AskUserQuestion is not available. Do not propose a waiver.');
    expect(message).toContain(`You have ${DISPATCH_PROTOCOL.REVIEWER_API_CALL_BUDGET} calls`);
  });
});

describe('a conflict re-reviewer before User\'s code review', () => {
  const instructions = 'You review ticket #{{ticketId}}, round {{round}}, as job {{jobId}}, with {{callBudget}} calls.\n\n{{ticketBody}}';
  const message = messageOf({
    ...CONFLICT, mergePlacement: 'before-human-code-review', phase: 're-reviewing', resumesSession: false
  }, 'conflict-re-reviewer', instructions);

  test('reads its instruction files, then the re-review of the merge before User\'s code review, never the Airlock', () => {
    expect(message.indexOf('Example basket adds up.')).toBeLessThan(message.indexOf('conflict re-reviewer of #012, job J9'));
    expect(message).toContain('Before User reviews the code');
    for (const fact of [CONFLICT.targetTip, CONFLICT.branchTip, CONFLICT.worktree, '- basket.ts', '- checkout.ts']) expect(message).toContain(fact);
    expect(message).not.toContain('Airlock');
    expect(message).not.toMatch(/\{\{\w+\}\}/);
  });

  test('is told it cannot ask User, proposes no waiver, and has the reviewer\'s budget', () => {
    expect(message).toContain('AskUserQuestion is not available. Do not propose a waiver.');
    expect(message).toContain(`You have ${DISPATCH_PROTOCOL.REVIEWER_API_CALL_BUDGET} calls`);
  });
});

describe('a session resumed on a conflicted merge before User\'s code review', () => {
  const message = HephaestusWording.redHandoffMessageOf({
    kind:                'merge-conflict',
    name:                'main',
    command:             null,
    fixCommand:          null,
    commit:              CONFLICT.branchTip,
    exitCode:            null,
    gateFailureNotePath: '/example-agency/jobs/J8/gate-failure.md',
    fullLogPath:         null,
    resume:              1,
    resumesAllowed:      2,
    callBudget:          RED_HANDOFF_RESUME_CALL_BUDGET,
    interruptedInstance: 1,
    mergedTip:           CONFLICT.targetTip,
  });

  test('is told the tip to merge again, its branch tip, the restart and its resume, on one line', () => {
    for (const fact of ['`main`', `Merge \`${CONFLICT.targetTip}\``, CONFLICT.branchTip, '/example-agency/jobs/J8/gate-failure.md', 'resume 1 of 2']) {
      expect(message).toContain(fact);
    }
    expect(message).toContain(`${RED_HANDOFF_RESUME_CALL_BUDGET} tool calls`);
    expect(message).not.toContain('\n');
    expect(message).not.toMatch(/\{\{\w+\}\}/);
  });
});

describe('the asking tool a message names', () => {
  test('is the adapter\'s fill, so with Claude Code\'s fills the message reads as it did before the port named it', () => {
    expect(messageOf(CONFLICT)).toContain('You cannot ask User in the Airlock: AskUserQuestion is not available.');
    expect(messageOf(CONFLICT, 'reviewer', '', { ...PROMPT_FILLS, askUserTool: 'example-ask' }))
      .toContain('You cannot ask User in the Airlock: example-ask is not available.');
  });
});
