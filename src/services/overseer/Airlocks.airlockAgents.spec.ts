/**
 * The ticket's most recent agent in its Airlock, on a scratch repository with the harness's fake gate and fake launcher. What matters: a
 * merge-in conflict and a red merged tree each go to the ticket's reviewer (its builder with no review phase) as a `merge-agent` job, never
 * to another role; a conflict hands over the conflicted files; a red gate resumes the same session until the red handoff resumes are spent,
 * and then the merge aborts, the slot frees and the ticket parks; an agent that could not resume is replaced by a fresh one of its role and
 * attempt, which spends no resume; and a group refresh, which has no ticket agent, aborts on a conflict and asks User. The folders are real;
 * git is the fake of `src/testing/FakeGit.ts`.
 */
import {
  afterEach,
  describe,
  expect,
  test
} from 'bun:test';

import { useFakeGit }    from '../../testing/FakeGit.ts';
import { RedHandoff }    from './RedHandoff.ts';
import {
  commitResolutionOn,
  createAirlocksHarnessOn,
  finishMergeAgent,
  HARNESS_AT,
  type AirlocksHarness
} from './testing/AirlocksHarness.ts';

const fakeGit = useFakeGit();

let harness: AirlocksHarness | null = null;

afterEach(() => {
  harness?.remove();
  harness = null;
});

function redHarness(): AirlocksHarness {
  const current = createAirlocksHarnessOn(fakeGit, [{ id: '001', change: ['checkout.ts', 'export const checkout = 1;\n'] }]);
  current.settings.gateOutcome = 'failed';
  return current;
}

function launchedRoles(current: AirlocksHarness): unknown[] {
  return current.board.logRecordsSoFar().flatMap((record) => (record.kind === 'job-launched' && record.fields.kind === 'merge-agent' ? [record.fields.role] : []));
}

describe('a merge-in conflict', () => {
  test('goes to the ticket\'s reviewer in the Airlock worktree, with the conflicted files kept for its handover', async () => {
    harness = createAirlocksHarnessOn(fakeGit, [{ id: '001', change: ['base.ts', 'export const base = 2;\n'] }]);
    fakeGit.commitFile(harness.repository, 'base.ts', 'export const base = 3;\n');

    await harness.slots.sweep();

    expect(harness.mergeAgent()).toMatchObject({
      kind: 'merge-agent', role: 'reviewer', attempt: 1, ticketIds: ['001']
    });
    expect(harness.keptAirlockFacts.get(harness.mergeJob()?.id ?? '')).toEqual({ conflictedFiles: 'base.ts' });
    expect(harness.mergeJob()?.airlock?.phase).toBe('resolving');

    commitResolutionOn(fakeGit, harness.worktreeOf('001'), 'base.ts', 'export const base = 4;\n');
    finishMergeAgent(harness, {
      outcome: 'resolved', resolvedFiles: ['base.ts'], notes: '', reportKind: null
    });
    await harness.slots.sweep();
    expect(harness.board.tickets()[0]?.frontmatter.status).toBe('delivered');
    expect(launchedRoles(harness)).toEqual(['reviewer']);
  });

  test('goes to the builder when the pipeline has no review phase', async () => {
    harness = createAirlocksHarnessOn(fakeGit, [{ id: '001', change: ['base.ts', 'export const base = 2;\n'] }], {}, false);
    fakeGit.commitFile(harness.repository, 'base.ts', 'export const base = 3;\n');

    await harness.slots.sweep();

    expect(harness.mergeAgent()).toMatchObject({ kind: 'merge-agent', role: 'builder' });
  });
});

describe('a red merged tree', () => {
  test('resumes the reviewer with the red handoff, and resumes the same session again while resumes are left', async () => {
    harness = redHarness();
    await harness.slots.sweep();
    const agent = harness.mergeAgent();
    expect(agent).toMatchObject({ role: 'reviewer' });
    expect(harness.mergeJob()?.airlock?.phase).toBe('fixing');
    const mergeJobFolder = `${harness.repository}/.example-tracker/jobs/${harness.mergeJob()?.id ?? ''}`;
    expect(RedHandoff.redHandoffFactsOf(mergeJobFolder)).toMatchObject({ name: 'tests', resume: 1, resumesAllowed: 2 });

    finishMergeAgent(harness, {
      outcome: 'resolved', resolvedFiles: [], notes: '', reportKind: null
    });
    await harness.slots.sweep();

    expect(harness.mergeAgent()).toMatchObject({ id: agent?.id, state: 'interrupted', interruption: 'handoff-red' });
    expect(launchedRoles(harness)).toEqual(['reviewer']);
  });

  test('past the resumes ends the agent failed, aborts the merge, frees the slot and parks the ticket', async () => {
    harness = redHarness();
    const mainTip = harness.tipOf('main');
    await harness.slots.sweep();
    finishMergeAgent(harness, {
      outcome: 'resolved', resolvedFiles: [], notes: '', reportKind: null
    });
    await harness.slots.sweep();
    finishMergeAgent(harness, {
      outcome: 'resolved', resolvedFiles: [], notes: '', reportKind: null
    });
    await harness.slots.sweep();

    expect(harness.board.airlockHolderOf('main')).toBeUndefined();
    expect(harness.board.tickets()[0]?.frontmatter.hold).toBe('parked:merge-gate-red');
    expect(harness.board.decisions().map((decision) => decision.kind)).toEqual(['parked']);
    expect(harness.tipOf('main')).toBe(mainTip);
  });
});

describe('an agent whose session could not be resumed', () => {
  test('is replaced by a fresh agent of the same role and attempt, which spends no resume', async () => {
    harness = redHarness();
    await harness.slots.sweep();
    const replaced = harness.mergeAgent();
    harness.board.endJob(replaced?.id ?? '', { outcome: 'replaced', cause: 'resume-failed' }, HARNESS_AT);

    await harness.slots.sweep();

    const fresh = harness.mergeAgent();
    expect(fresh).toMatchObject({ role: 'reviewer', attempt: replaced?.attempt });
    expect(fresh?.id).not.toBe(replaced?.id);
    finishMergeAgent(harness, {
      outcome: 'resolved', resolvedFiles: [], notes: '', reportKind: null
    });
    await harness.slots.sweep();
    expect(harness.mergeAgent()).toMatchObject({ id: fresh?.id, interruption: 'handoff-red' });
  });
});

describe('a group refresh conflict', () => {
  test('aborts the refresh, frees the Airlock and opens merge-refused to User, launching no agent', async () => {
    harness = createAirlocksHarnessOn(fakeGit, [{
      id: '010', group: 'example', status: 'reviewed', change: ['cart.ts', 'export const cart = 1;\n']
    }], { GROUP_REFRESH_AFTER_MAIN_COMMITS: 1 });
    const groupTip = harness.tipOf('group-example');
    fakeGit.commitFile(harness.repository, 'cart.ts', 'export const cart = 2;\n');

    await harness.slots.sweep();

    expect(launchedRoles(harness)).toEqual([]);
    expect(harness.board.jobs().filter((job) => job.kind === 'refresh')).toEqual([]);
    expect(harness.board.decisions().map((decision) => [decision.kind, decision.ticketIds])).toEqual([['merge-refused', []]]);
    expect(harness.tipOf('group-example')).toBe(groupTip);
  });
});
