/**
 * The main line's Airlock on a scratch repository (design section 6). What matters: candidates land one at a time in queue order, each
 * on its gated merged tree and by fast-forward alone; a conflict goes back to the ticket's reviewer and can end only in a landing or a
 * `merge-refused` decision; a moved target, a dirty checkout and a refused stamp each map to one outcome that cannot loop; and a slot is kept while
 * anything holds it, recovered only when nothing does. A group's tickets and refreshes land by `merge --ff-only` in the group's own
 * worktree, a refresh is due only as MergeQueueUtil says and never beside a queued release, and the release lands the whole bundle on main.
 */
import { existsSync, writeFileSync } from 'node:fs';
import { join }                      from 'node:path';

import { afterEach, expect, test }        from 'bun:test';
import { LIFECYCLE_LIMITS }               from '../../shared/constants/LifecycleLimits.ts';
import { RED_HANDOFF_RESUME_CALL_BUDGET } from '../../shared/constants/OverseerLimits.ts';
import { commitFile, gitOutputIn }        from '../../testing/ScratchWorkspace.ts';
import { describeWhenGitIsPresent }       from '../../testing/ToolGuard.ts';
import {
  createAirlocksHarness,
  finishMergeAgent,
  HARNESS_AT,
  type AirlocksHarness,
  resolveAs
}                                   from './testing/AirlocksHarness.ts';

let harness: AirlocksHarness | null = null;

afterEach(() => {
  harness?.remove();
  harness = null;
});

function kindsLogged(current: AirlocksHarness, kind: string): Record<string, unknown>[] {
  return current.board.logRecordsSoFar().filter((record) => record.kind === kind).map((record) => record as unknown as Record<string, unknown>);
}

function conflictingHarness(limits = {}): AirlocksHarness {
  const current = createAirlocksHarness([{ id: '001', change: ['base.ts', 'export const base = 2;\n'] }], limits);
  commitFile(current.repository, 'base.ts', 'export const base = 3;\n');
  return current;
}

describeWhenGitIsPresent('two clean candidates', () => {
  test('land in queue order, each gated on its merged tree, the main line moving only by fast-forward, with typed merge records', async () => {
    harness = createAirlocksHarness([
      { id: '002', change: ['cart.ts', 'export const cart = 1;\n'] },
      { id: '001', change: ['checkout.ts', 'export const checkout = 1;\n'] },
    ]);
    const firstTip = harness.tipOf('main');
    const branchTips = [harness.tipOf('ticket-002'), harness.tipOf('ticket-001')];

    expect(await harness.slots.sweep()).toEqual([]);

    const landed = kindsLogged(harness, 'merge-landed').map((record) => record['fields']);
    expect(landed).toHaveLength(2);
    const started = kindsLogged(harness, 'merge-started');
    expect(started.map((record) => (record['fields'] as { branchTip: string }).branchTip)).toEqual(branchTips);
    expect(started[0]?.['fields']).toEqual({
      target: 'main', targetTip: firstTip, branchTip: branchTips[0], predictedConflictFiles: []
    });
    const [firstLanding, secondLanding] = landed as { commit: string; kind: string; target: string }[];
    expect(firstLanding?.kind).toBe('landed');
    expect(harness.tipOf('main')).toBe(secondLanding?.commit ?? '');
    gitOutputIn(harness.repository, ['merge-base', '--is-ancestor', firstTip, firstLanding?.commit ?? '']);
    gitOutputIn(harness.repository, ['merge-base', '--is-ancestor', firstLanding?.commit ?? '', secondLanding?.commit ?? '']);
    expect(harness.gatedTrees).toEqual([
      gitOutputIn(harness.repository, ['rev-parse', `${firstLanding?.commit ?? ''}^{tree}`]),
      gitOutputIn(harness.repository, ['rev-parse', `${secondLanding?.commit ?? ''}^{tree}`]),
    ]);
    expect(harness.board.tickets().map((ticket) => ticket.frontmatter.status)).toEqual(['delivered', 'delivered']);
    expect(harness.board.decisions()).toEqual([]);
    expect(harness.board.incidents()).toEqual([]);
  });

  test('the slot is written on the merge job record in each phase\'s hold', async () => {
    harness = createAirlocksHarness([{ id: '001', change: ['checkout.ts', 'export const checkout = 1;\n'] }]);
    await harness.slots.sweep();
    expect(harness.phases).toEqual(['merge-in', 'gating', 'landing']);
  });
});

describeWhenGitIsPresent('a conflicting candidate', () => {
  test('gets its reviewer as a merge-agent job holding the slot, and once resolved is gated and landed', async () => {
    harness = conflictingHarness();
    await harness.slots.sweep();
    const agent = harness.mergeAgent();
    expect(agent).toMatchObject({
      kind: 'merge-agent', role: 'reviewer', parentJobId: harness.mergeJob()?.id, ticketIds: ['001']
    });
    expect(harness.mergeJob()?.airlock?.phase).toBe('resolving');

    resolveAs(harness, '001', 'base.ts', 'export const base = 4;\n');
    await harness.slots.sweep();

    expect(harness.stopped).toEqual([agent?.id ?? '']);
    expect(harness.phases).toEqual(['merge-in', 'resolving', 'gating', 'landing']);
    expect(harness.board.tickets()[0]?.frontmatter.status).toBe('delivered');
    expect(harness.board.decisions()).toEqual([]);
  });

  test('at its resumed call budget the agent is stopped, the merge aborted and the slot freed, and merge-refused opens', async () => {
    harness = conflictingHarness();
    await harness.slots.sweep();
    const agentId = harness.mergeAgent()?.id ?? '';
    harness.board.moveJob(agentId, 'running', HARNESS_AT);
    harness.settings.reading = { calls: RED_HANDOFF_RESUME_CALL_BUDGET, report: undefined };
    const branchTip = harness.tipOf('ticket-001');

    await harness.slots.sweep();

    expect(harness.stopped).toEqual([agentId]);
    expect(harness.mergeJob()).toBeUndefined();
    expect(gitOutputIn(harness.worktreeOf('001'), ['rev-parse', 'HEAD'])).toBe(branchTip);
    expect(harness.board.decisions().map((decision) => decision.kind)).toEqual(['merge-refused']);
    expect(harness.board.ticketIsMergeQueued('001')).toBe(false);
  });

  test('cannot-resolve aborts with merge-refused showing the notes, and a reportKind opens its incident with no job waiting', async () => {
    for (const [reportKind, incidentKinds] of [['malformed-ticket', ['malformed-ticket']], ['system-blocker', ['system-question']], [null, []]] as const) {
      harness?.remove();
      harness = conflictingHarness();
      await harness.slots.sweep();
      finishMergeAgent(harness, { outcome: 'cannot-resolve', notes: `Example ${String(reportKind)} reason`, reportKind });

      await harness.slots.sweep();

      expect(harness.board.decisions().map((decision) => [decision.kind, decision.context])).toEqual([['merge-refused', `Example ${String(reportKind)} reason`]]);
      expect(harness.board.incidents().map((incident) => [incident.kind, incident.jobId])).toEqual(incidentKinds.map((kind) => [kind, null]));
      expect(harness.mergeJob()).toBeUndefined();
      expect(harness.stopped).toHaveLength(1);
      expect(gitOutputIn(harness.worktreeOf('001'), ['status', '--porcelain'])).toBe('');
    }
  });

  test('a resolved report whose merge fails V10 (paths still unmerged) aborts with merge-refused', async () => {
    harness = conflictingHarness();
    await harness.slots.sweep();
    finishMergeAgent(harness, {
      outcome: 'resolved', resolvedFiles: ['base.ts'], notes: 'Example claim', reportKind: null
    });

    await harness.slots.sweep();

    expect(harness.board.decisions().map((decision) => decision.kind)).toEqual(['merge-refused']);
    expect(harness.board.tickets()[0]?.frontmatter.status).toBe('in-review');
  });
});

describeWhenGitIsPresent('the merged tree\'s gate', () => {
  function recordPassOn(current: AirlocksHarness, revision: string): string {
    const tree = gitOutputIn(current.repository, ['rev-parse', `${revision}^{tree}`]);
    current.board.recordGateRan({ tree, outcome: 'passed', cached: false }, HARNESS_AT);
    return tree;
  }

  test('runs no gate when the merged tree is the branch\'s own tree the gates last passed, and lands it', async () => {
    harness = createAirlocksHarness([{ id: '001', change: ['checkout.ts', 'export const checkout = 1;\n'] }]);
    recordPassOn(harness, 'ticket-001');

    await harness.slots.sweep();

    expect(harness.gatedTrees).toEqual([]);
    expect(kindsLogged(harness, 'merge-landed')).toHaveLength(1);
  });

  test('gates a merged tree that differs from the tree the gates last passed', async () => {
    harness = createAirlocksHarness([{ id: '001', change: ['checkout.ts', 'export const checkout = 1;\n'] }]);
    const branchTree = recordPassOn(harness, 'ticket-001');
    commitFile(harness.repository, 'cart.ts', 'export const cart = 1;\n');

    await harness.slots.sweep();

    expect(harness.gatedTrees).toHaveLength(1);
    expect(harness.gatedTrees[0]).not.toBe(branchTree);
  });

  test('a failed prepare step opens setup-failed, launches no agent, and lands nothing', async () => {
    harness = createAirlocksHarness([{ id: '001', change: ['checkout.ts', 'export const checkout = 1;\n'] }]);
    harness.settings.gateOutcome = 'setup-failed';
    const mainTip = harness.tipOf('main');

    await harness.slots.sweep();

    expect(harness.board.incidents().map((incident) => incident.kind)).toEqual(['setup-failed']);
    expect(harness.board.jobs().filter((job) => job.kind === 'merge-agent')).toEqual([]);
    expect(kindsLogged(harness, 'gate-ran')).toEqual([]);
    expect(harness.tipOf('main')).toBe(mainTip);
  });

  test('a ticket parked by hand while the slot holds it aborts the merge and frees the slot on the next sweep', async () => {
    harness = createAirlocksHarness([{ id: '001', change: ['checkout.ts', 'export const checkout = 1;\n'] }]);
    harness.settings.gateOutcome = 'failed';
    const mainTip = harness.tipOf('main');
    await harness.slots.sweep();
    harness.board.parkTicket('001', 'Parked', null, HARNESS_AT);

    await harness.slots.sweep();

    expect(harness.board.airlockHolderOf('main')).toBeUndefined();
    expect(kindsLogged(harness, 'job-ended').map((record) => (record['fields'] as { cause?: string }).cause)).toContain('merge-aborted');
    expect(harness.tipOf('main')).toBe(mainTip);
  });
});

describeWhenGitIsPresent('a target that moved under the slot', () => {
  test('requeues silently from branchTip, then parks after TARGET_MOVED_MERGES_BEFORE_PARKING moves in a row', async () => {
    harness = createAirlocksHarness([{ id: '001', change: ['checkout.ts', 'export const checkout = 1;\n'] }]);
    let moves = 0;
    const current = harness;
    harness.settings.beforeGate = () => {
      moves += 1;
      commitFile(current.repository, `by-hand-${moves}.ts`, 'export const byHand = true;\n');
    };

    await harness.slots.sweep();

    expect(moves).toBe(2);
    const endings = kindsLogged(harness, 'job-ended').map((record) => (record['fields'] as { cause?: string }).cause);
    expect(endings).toEqual(['target-moved', 'target-moved']);
    expect(harness.board.tickets()[0]?.frontmatter.hold).toBe('parked:target-moved');
    expect(harness.board.decisions().map((decision) => decision.kind)).toEqual(['parked']);
    expect(gitOutputIn(harness.worktreeOf('001'), ['rev-parse', 'HEAD'])).toBe(harness.tipOf('ticket-001'));
  });

  test('without the ref denies, one target-moved decision opens per new tip and that target\'s landing waits', async () => {
    harness = createAirlocksHarness([{ id: '001', change: ['checkout.ts', 'export const checkout = 1;\n'] }]);
    harness.settings.refDeniesHold = false;
    const current = harness;
    harness.settings.beforeGate = () => {
      commitFile(current.repository, 'by-hand.ts', 'export const byHand = true;\n');
      current.settings.beforeGate = () => undefined;
    };

    await harness.slots.sweep();
    await harness.slots.sweep();

    expect(harness.board.decisions().map((decision) => [decision.kind, decision.context])).toEqual([['target-moved', harness.tipOf('main')]]);
    expect(harness.mergeJob()?.airlock?.phase).toBe('landing');
  });
});

describeWhenGitIsPresent('a merged tree whose line confinement refused', () => {
  test('opens sandbox-unavailable, logs no gate run and leaves the Airlock slot waiting', async () => {
    harness = createAirlocksHarness([{ id: '001', change: ['checkout.ts', 'export const checkout = 1;\n'] }]);
    harness.settings.gateOutcome = 'sandbox-unavailable';

    await harness.slots.sweep();

    expect(harness.board.incidents().map((incident) => [incident.kind, incident.defaultMove])).toEqual([['sandbox-unavailable', 'gate-retry']]);
    expect(kindsLogged(harness, 'gate-ran')).toEqual([]);
    expect(harness.mergeJob()?.airlock?.phase).toBe('gating');
  });
});

describeWhenGitIsPresent('a main checkout that blocks the fast-forward', () => {
  test('shows dirty-main-checkout, rechecked every sweep, and lands once the checkout is clean', async () => {
    harness = createAirlocksHarness([{ id: '001', change: ['base.ts', 'export const base = 2;\n'] }]);
    writeFileSync(join(harness.repository, 'base.ts'), 'export const base = 9;\n');

    expect(await harness.slots.sweep()).toEqual([{
      target: 'main', branch: 'main', blockingFiles: ['base.ts'], heldFiles: []
    }]);
    expect(await harness.slots.sweep()).toHaveLength(1);
    expect(kindsLogged(harness, 'merge-started')).toHaveLength(1);

    gitOutputIn(harness.repository, ['checkout', '--', 'base.ts']);
    expect(await harness.slots.sweep()).toEqual([]);
    expect(harness.board.tickets()[0]?.frontmatter.status).toBe('delivered');
  });

  test('not-on-main-line holds the target the same way, naming the branch checked out', async () => {
    harness = createAirlocksHarness([{ id: '001', change: ['checkout.ts', 'export const checkout = 1;\n'] }]);
    gitOutputIn(harness.repository, ['checkout', '-q', '-b', 'example-elsewhere']);
    expect(await harness.slots.sweep()).toEqual([{
      target: 'main', branch: 'example-elsewhere', blockingFiles: [], heldFiles: []
    }]);
  });
});

describeWhenGitIsPresent('a stale green', () => {
  test('a branch moved after its green loses mergeQueued, is gated in its own worktree with no slot held, and green queues and lands it', async () => {
    harness = createAirlocksHarness([{ id: '001', change: ['checkout.ts', 'export const checkout = 1;\n'] }]);
    const current = harness;
    commitFile(current.worktreeOf('001'), 'checkout.ts', 'export const checkout = 2;\n');
    const seenAtTheGate: unknown[] = [];
    current.settings.beforeGate = () => seenAtTheGate.push([current.board.airlockHolderOf('main'), current.board.ticketIsMergeQueued('001')]);
    await current.slots.sweep();
    expect(seenAtTheGate[0]).toEqual([undefined, false]);
    expect(current.gatedTrees[0]).toBe(current.branchTreeOf('001'));
    expect(kindsLogged(current, 'merge-queued')).toHaveLength(2);
    expect(current.board.tickets()[0]?.frontmatter.status).toBe('delivered');
  });

  test('a branch moved after its green loses mergeQueued even when its worktree is gone and cannot be gated', async () => {
    harness = createAirlocksHarness([{ id: '001', change: ['checkout.ts', 'export const checkout = 1;\n'] }]);
    commitFile(harness.worktreeOf('001'), 'checkout.ts', 'export const checkout = 2;\n');
    gitOutputIn(harness.repository, ['worktree', 'remove', '--force', harness.worktreeOf('001')]);
    await harness.slots.sweep();
    expect(harness.board.ticketIsMergeQueued('001')).toBe(false);
    expect(harness.gatedTrees).toEqual([]);
    expect(kindsLogged(harness, 'merge-started')).toEqual([]);
  });

  test.each([
    ['its worktree is gone', (current: AirlocksHarness) => gitOutputIn(current.repository, ['worktree', 'remove', '--force', current.worktreeOf('001')])],
    ['its worktree HEAD is not the branch tree', (current: AirlocksHarness) => gitOutputIn(current.worktreeOf('001'), ['checkout', '-q', '--detach', 'main'])],
  ])('a stale green that cannot be gated because %s leaves the ticket to the policy, which launches its next reviewer', async (_case, makeUngateable) => {
    harness = createAirlocksHarness([{ id: '001', change: ['checkout.ts', 'export const checkout = 1;\n'] }]);
    commitFile(harness.worktreeOf('001'), 'checkout.ts', 'export const checkout = 2;\n');
    makeUngateable(harness);
    await harness.slots.sweep();
    expect(harness.gatedTrees).toEqual([]);
    expect(harness.board.tickets()[0]?.frontmatter.status).toBe('in-review');
    harness.board.setOverseerState('running', HARNESS_AT);
    const advanced = harness.board.followPlaybook({ ...LIFECYCLE_LIMITS, now: HARNESS_AT, usageResetsAt: null }, {
      mainLine:                     'main',
      groupTargetPrefix:            'group-',
      installVersionChanged:        false,
      targetsHoldingManagedBlock:   [],
      ticketIdsTouchingAgentConfig: [],
      closedDeliveryTurns:          [],
      budgetSpentDeliveryTurns:     [],
      assistantHasAnswered:         false,
      assistantBootRetryDue:        false,
    }, () => ({ questions: [], context: '' }));
    expect(advanced.steps.filter((step) => step.kind === 'launch-review')).toEqual([{
      kind: 'launch-review', ticketId: '001', round: 1, target: 'main'
    }]);
  });

  test('without a review phase a stale green that cannot be gated keeps the ticket awaiting green, so a later sweep gates it again', async () => {
    harness = createAirlocksHarness([{ id: '001', change: ['checkout.ts', 'export const checkout = 1;\n'] }], {}, false);
    commitFile(harness.worktreeOf('001'), 'checkout.ts', 'export const checkout = 2;\n');
    gitOutputIn(harness.worktreeOf('001'), ['checkout', '-q', '--detach', 'main']);
    await harness.slots.sweep();
    expect(harness.gatedTrees).toEqual([]);
    expect(harness.board.ticketsAwaitingGreenOf('main', () => 'main', harness.branchTreeOf)).toEqual([{ ticketId: '001', queued: false }]);

    gitOutputIn(harness.worktreeOf('001'), ['checkout', '-q', 'ticket-001']);
    await harness.slots.sweep();
    expect(harness.gatedTrees[0]).toBe(harness.branchTreeOf('001'));
    expect(harness.board.tickets()[0]?.frontmatter.status).toBe('delivered');
  });

  test('a changed pipeline gates the unchanged tree again before the Airlock admits it', async () => {
    harness = createAirlocksHarness([{ id: '001', change: ['checkout.ts', 'export const checkout = 1;\n'] }]);
    harness.board.addGate({ name: 'tests', run: 'bun test' }, HARNESS_AT);
    await harness.slots.sweep();
    expect(harness.gatedTrees[0]).toBe(harness.branchTreeOf('001'));
    expect(harness.board.tickets()[0]?.frontmatter.status).toBe('delivered');
  });

  test('red leaves the ticket in review unqueued with no green, and writes the red handoff for the next reviewer in the last review\'s folder', async () => {
    harness = createAirlocksHarness([{ id: '001', change: ['checkout.ts', 'export const checkout = 1;\n'] }]);
    const review = harness.board.launchJob({
      kind: 'review', role: 'reviewer', ticketIds: ['001'], parentJobId: null, attempt: 1, target: 'main'
    }, HARNESS_AT);
    harness.board.endJob(review.job.id, { outcome: 'reviewed' }, HARNESS_AT);
    commitFile(harness.worktreeOf('001'), 'checkout.ts', 'export const checkout = 2;\n');
    harness.settings.gateOutcome = 'failed';
    await harness.slots.sweep();
    expect(harness.board.ticketIsMergeQueued('001')).toBe(false);
    expect(harness.board.greenIsCurrent('001', harness.branchTreeOf('001'))).toBe(false);
    expect(harness.board.tickets()[0]?.frontmatter.status).toBe('in-review');
    expect(kindsLogged(harness, 'merge-started')).toEqual([]);
    expect(existsSync(join(harness.repository, '.example-tracker', 'jobs', review.job.id, 'stale-green', 'red-handoff.json'))).toBe(true);
  });
});

describeWhenGitIsPresent('a landing refused for its ticket', () => {
  test('an Acceptance not accounted for clears mergeQueued, holds the ticket and opens landing-refused', async () => {
    harness = createAirlocksHarness([{ id: '001', change: ['checkout.ts', 'export const checkout = 1;\n'], body: '## Acceptance\n\nA1. Example item.\n' }]);
    await harness.slots.sweep();
    expect(harness.board.ticketIsMergeQueued('001')).toBe(false);
    expect(harness.board.tickets()[0]?.frontmatter.hold).toBe('landing-refused:acceptance-unaccounted');
    expect(harness.board.decisions().map((decision) => [decision.kind, decision.context])).toEqual([['landing-refused', 'acceptance-unaccounted']]);
    expect(kindsLogged(harness, 'merge-started')).toHaveLength(1);
  });
});

describeWhenGitIsPresent('slot recovery', () => {
  async function slotLeftMidMerge(): Promise<AirlocksHarness> {
    const current = conflictingHarness();
    current.board.claimAirlock({
      ticketId: '001', target: 'main', targetTip: current.tipOf('main'), branchTip: current.tipOf('ticket-001'), predictedConflictFiles: ['base.ts'],
    }, () => 'main', current.branchTreeOf, HARNESS_AT);
    Bun.spawnSync(['git', 'merge', '--no-ff', '--no-edit', current.tipOf('main')], { cwd: current.worktreeOf('001') });
    return Promise.resolve(current);
  }

  test('a merge-in with MERGE_HEAD and a live holder is kept', async () => {
    harness = await slotLeftMidMerge();
    harness.settings.watcherIsLive = true;
    const jobId = harness.mergeJob()?.id;
    await harness.slots.sweep();
    expect(harness.mergeJob()?.id).toBe(jobId);
    expect(gitOutputIn(harness.worktreeOf('001'), ['rev-parse', '-q', '--verify', 'MERGE_HEAD'])).not.toBe('');
  });

  test('a merge-in with MERGE_HEAD and no live holder is aborted, reset to branchTip and requeued', async () => {
    harness = await slotLeftMidMerge();
    const jobId = harness.mergeJob()?.id;
    await harness.slots.sweep();
    expect(kindsLogged(harness, 'job-ended').find((record) => record['jobId'] === jobId)?.['fields']).toMatchObject({ outcome: 'stopped', cause: 'orphaned' });
    expect(harness.mergeJob()?.id).not.toBe(jobId);
    expect(harness.mergeAgent()).toBeDefined();
  });

  test('an interrupted Airlock agent keeps its slot; one stopped with no usable result frees it', async () => {
    harness = conflictingHarness();
    await harness.slots.sweep();
    const agentId = harness.mergeAgent()?.id ?? '';
    harness.board.moveJob(agentId, 'running', HARNESS_AT);
    harness.board.interruptJob(agentId, 'reboot', HARNESS_AT);
    const jobId = harness.mergeJob()?.id;
    await harness.slots.sweep();
    expect(harness.mergeJob()?.id).toBe(jobId);

    harness.board.endJob(agentId, { outcome: 'stopped' }, HARNESS_AT);
    await harness.slots.sweep();
    expect(kindsLogged(harness, 'job-ended').find((record) => record['jobId'] === jobId)?.['fields']).toMatchObject({ cause: 'orphaned' });
  });

  test('a job in landing whose commit the main line already holds finishes the board side', async () => {
    harness = createAirlocksHarness([{ id: '001', change: ['checkout.ts', 'export const checkout = 1;\n'] }]);
    const current = harness;
    harness.settings.beforeGate = () => {
      gitOutputIn(current.repository, ['merge', '-q', '--ff-only', gitOutputIn(current.worktreeOf('001'), ['rev-parse', 'HEAD'])]);
    };
    await harness.slots.sweep();
    expect(harness.board.tickets()[0]?.frontmatter.status).toBe('delivered');
    expect(kindsLogged(harness, 'merge-landed')).toHaveLength(1);
  });
});

describeWhenGitIsPresent('a group\'s slot in its own worktree', () => {
  const groupWorktree = (current: AirlocksHarness): string => join(`${current.repository}-worktrees`, 'group-example');

  test('a group ticket lands by merge --ff-only in the group worktree after the compare-and-swap, is approved, and main stays put', async () => {
    harness = createAirlocksHarness([{ id: '010', group: 'example', change: ['cart.ts', 'export const cart = 1;\n'] }]);
    const mainTip = harness.tipOf('main');
    const groupTip = harness.tipOf('group-example');
    expect(groupTip).toBe(mainTip);
    commitFile(harness.repository, 'main-only.ts', 'export const mainOnly = 1;\n');

    await harness.slots.sweep();

    const [landing] = kindsLogged(harness, 'merge-landed').map((record) => record['fields'] as { commit: string; kind: string; target: string });
    expect(landing).toMatchObject({ target: 'group-example', kind: 'integrated' });
    expect(harness.tipOf('group-example')).toBe(landing?.commit ?? '');
    expect(gitOutputIn(groupWorktree(harness), ['rev-parse', 'HEAD'])).toBe(landing?.commit ?? '');
    expect(gitOutputIn(harness.repository, ['rev-parse', `${landing?.commit ?? ''}^1`])).toBe(groupTip);
    expect(kindsLogged(harness, 'merge-started')[0]?.['fields']).toMatchObject({ target: 'group-example', targetTip: groupTip });
    expect(harness.board.tickets()[0]?.frontmatter.status).toBe('reviewed');
    expect(kindsLogged(harness, 'job-ended').map((record) => (record['fields'] as { outcome: string }).outcome)).toEqual(['integrated']);
    expect(harness.tipOf('main')).not.toBe(landing?.commit ?? '');
  });

  test('a refresh merges main in a temporary worktree, lands the same way, and is not due again once the group holds main', async () => {
    harness = createAirlocksHarness([{
      id: '010', group: 'example', status: 'reviewed', change: ['cart.ts', 'export const cart = 1;\n']
    }], { GROUP_REFRESH_AFTER_MAIN_COMMITS: 1 });
    const groupTip = harness.tipOf('group-example');
    commitFile(harness.repository, 'main-only.ts', 'export const mainOnly = 1;\n');
    const mainTip = harness.tipOf('main');

    await harness.slots.sweep();
    await harness.slots.sweep();

    const launched = kindsLogged(harness, 'job-launched').map((record) => record['fields'] as { kind: string; target: string });
    expect(launched).toEqual([expect.objectContaining({ kind: 'refresh', target: 'group-example' })]);
    expect(kindsLogged(harness, 'merge-started')[0]?.['fields']).toMatchObject({ target: 'group-example', targetTip: groupTip, branchTip: mainTip });
    const newGroupTip = harness.tipOf('group-example');
    expect(gitOutputIn(harness.repository, ['rev-parse', `${newGroupTip}^1`, `${newGroupTip}^2`]).split('\n')).toEqual([groupTip, mainTip]);
    expect(kindsLogged(harness, 'job-ended').map((record) => (record['fields'] as { outcome: string }).outcome)).toEqual(['refreshed']);
    expect(existsSync(join(`${harness.repository}-worktrees`, 'refresh-group-example'))).toBe(false);
  });

  test('a refresh below GROUP_REFRESH_AFTER_MAIN_COMMITS with a clean prediction is not due', async () => {
    harness = createAirlocksHarness([{
      id: '010', group: 'example', status: 'reviewed', change: ['cart.ts', 'export const cart = 1;\n']
    }], { GROUP_REFRESH_AFTER_MAIN_COMMITS: 2 });
    commitFile(harness.repository, 'main-only.ts', 'export const mainOnly = 1;\n');
    await harness.slots.sweep();
    expect(kindsLogged(harness, 'job-launched')).toEqual([]);
  });

  test('the release merges main once in its own worktree, gates, fast-forwards main, delivers the bundle and removes the group', async () => {
    harness = createAirlocksHarness([
      {
        id: '010', group: 'example', status: 'reviewed', change: ['cart.ts', 'export const cart = 1;\n']
      },
      {
        id: '011', group: 'example', status: 'reviewed', dependsOn: ['010'], change: ['totals.ts', 'export const totals = 1;\n']
      },
      {
        id: '012', group: 'example', releasesGroup: true, dependsOn: ['011'], change: ['release.ts', 'export const release = 1;\n']
      },
    ], { GROUP_REFRESH_AFTER_MAIN_COMMITS: 1 });
    commitFile(harness.repository, 'main-only.ts', 'export const mainOnly = 1;\n');
    const mainTip = harness.tipOf('main');
    const releaseTip = harness.tipOf('ticket-012');

    await harness.slots.sweep();

    expect(kindsLogged(harness, 'job-launched').map((record) => (record['fields'] as { kind: string }).kind)).toEqual(['merge']);
    expect(kindsLogged(harness, 'merge-started')[0]?.['fields']).toMatchObject({ target: 'main', targetTip: mainTip, branchTip: releaseTip });
    const [landing] = kindsLogged(harness, 'merge-landed').map((record) => record['fields'] as { commit: string; kind: string });
    expect(landing?.kind).toBe('landed');
    expect(harness.tipOf('main')).toBe(landing?.commit ?? '');
    expect(gitOutputIn(harness.repository, ['rev-parse', `${landing?.commit ?? ''}^1`, `${landing?.commit ?? ''}^2`]).split('\n')).toEqual([releaseTip, mainTip]);
    expect(harness.gatedTrees).toEqual([gitOutputIn(harness.repository, ['rev-parse', `${landing?.commit ?? ''}^{tree}`])]);
    expect(harness.board.tickets().map((ticket) => ticket.frontmatter.status)).toEqual(['delivered', 'delivered', 'delivered']);
    expect(existsSync(groupWorktree(harness))).toBe(false);
    expect(Bun.spawnSync(['git', 'rev-parse', '--verify', '--quiet', 'refs/heads/group-example'], { cwd: harness.repository }).exitCode).not.toBe(0);
  });

  test('a group branch given a commit main lacks before its release lands is kept, and git\'s branch -d refusal is reported', async () => {
    harness = createAirlocksHarness([
      {
        id: '010', group: 'example', status: 'reviewed', change: ['cart.ts', 'export const cart = 1;\n']
      },
      {
        id: '012', group: 'example', releasesGroup: true, dependsOn: ['010'], change: ['release.ts', 'export const release = 1;\n']
      },
    ]);
    const current = harness;
    current.settings.beforeGate = () => commitFile(groupWorktree(current), 'late.ts', 'export const late = 1;\n');

    await harness.slots.sweep();

    expect(kindsLogged(harness, 'merge-landed').map((record) => (record['fields'] as { kind: string }).kind)).toEqual(['landed']);
    expect(harness.declinedCleanups).toEqual([{ cleanup: 'release', groupBranch: 'group-example', reason: expect.stringContaining('branch -d') }]);
    expect(harness.declinedCleanups[0]?.reason).toContain('not fully merged');
    expect(harness.tipOf('group-example')).not.toBe('');
  });

  test('a release whose branch lacks the group\'s tip is refused before its merge-in, so main and the bundle stay put', async () => {
    harness = createAirlocksHarness([
      {
        id: '010', group: 'example', status: 'reviewed', change: ['cart.ts', 'export const cart = 1;\n']
      },
      {
        id: '012', group: 'example', releasesGroup: true, dependsOn: ['010'], change: ['release.ts', 'export const release = 1;\n']
      },
    ]);
    commitFile(groupWorktree(harness), 'late.ts', 'export const late = 1;\n');
    const mainTip = harness.tipOf('main');

    await harness.slots.sweep();

    expect(kindsLogged(harness, 'merge-landed')).toEqual([]);
    expect(harness.tipOf('main')).toBe(mainTip);
    expect(harness.board.decisions().filter((decision) => decision.kind === 'merge-refused').map((decision) => decision.ticketIds)).toEqual([['012']]);
    expect(harness.board.tickets().map((ticket) => ticket.frontmatter.status)).toEqual(['reviewed', 'in-review']);
  });

  test('a release ticket whose bundle has not all integrated waits, and the group is not refreshed while it is queued', async () => {
    harness = createAirlocksHarness([
      {
        id: '010', group: 'example', status: 'reviewed', change: ['cart.ts', 'export const cart = 1;\n']
      },
      {
        id: '012', group: 'example', releasesGroup: true, dependsOn: ['010', '011'], change: ['release.ts', 'export const release = 1;\n']
      },
      { id: '011', group: 'example', change: ['base.ts', 'export const base = 2;\n'] },
    ], { GROUP_REFRESH_AFTER_MAIN_COMMITS: 1 });
    harness.board.setTicketMergeQueued('011', false, HARNESS_AT);
    commitFile(harness.repository, 'main-only.ts', 'export const mainOnly = 1;\n');
    await harness.slots.sweep();
    expect(kindsLogged(harness, 'job-launched')).toEqual([]);
    expect(harness.board.groupReleaseQueuedOrSlotted('example')).toBe('012');
  });
});
