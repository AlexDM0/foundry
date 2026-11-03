/**
 * The Airlocks with merge approval on, on a scratch repository. What matters: nothing lands that User did not accept, on the main line and
 * on a group target; an accepted ticket whose merge-in conflicts goes back to waiting for merge with no agent launched; a red merged tree
 * takes the accept and the review done away and leaves the red handoff for the next reviewer; and an accepted green tree lands with no
 * second approval.
 */
import { existsSync } from 'node:fs';
import { join }       from 'node:path';

import { afterEach, expect, test }                                 from 'bun:test';
import { commitFile }                                              from '../../testing/ScratchWorkspace.ts';
import { describeWhenGitIsPresent }                                from '../../testing/ToolGuard.ts';
import { createAirlocksHarness, HARNESS_AT, type AirlocksHarness } from './testing/AirlocksHarness.ts';

let harness: AirlocksHarness | null = null;

afterEach(() => {
  harness?.remove();
  harness = null;
});

function mergeApprovalHarness(...parameters: Parameters<typeof createAirlocksHarness>): AirlocksHarness {
  const current = createAirlocksHarness(...parameters);
  current.board.setApproval('merge', true, HARNESS_AT);
  return current;
}

function mergesStarted(current: AirlocksHarness): number {
  return current.board.logRecordsSoFar().filter((record) => record.kind === 'merge-started').length;
}

describeWhenGitIsPresent('merge approval on', () => {
  test('a reviewed ticket User did not accept waits for merge and never takes the main line\'s slot; once accepted it lands', async () => {
    harness = mergeApprovalHarness([{ id: '001', change: ['checkout.ts', 'export const checkout = 1;\n'] }]);
    const mainTip = harness.tipOf('main');
    await harness.slots.sweep();
    expect(mergesStarted(harness)).toBe(0);
    expect(harness.tipOf('main')).toBe(mainTip);
    expect(harness.board.ticketsWaitingForMergeOf('main', () => 'main', harness.branchTreeOf).map((waiting) => waiting.ticketId)).toEqual(['001']);

    harness.board.setTicketMergeAccepted('001', true, HARNESS_AT);
    await harness.slots.sweep();
    expect(harness.board.tickets()[0]?.frontmatter.status).toBe('delivered');
    expect(harness.board.decisions()).toEqual([]);
  });

  test('a group ticket User did not accept is not integrated; once accepted it is', async () => {
    harness = mergeApprovalHarness([{ id: '001', group: 'checkout', change: ['checkout.ts', 'export const checkout = 1;\n'] }]);
    await harness.slots.sweep();
    expect(mergesStarted(harness)).toBe(0);
    expect(harness.board.tickets()[0]?.frontmatter.status).toBe('in-review');

    harness.board.setTicketMergeAccepted('001', true, HARNESS_AT);
    await harness.slots.sweep();
    expect(harness.board.tickets()[0]?.frontmatter.status).toBe('reviewed');
  });

  test('an accepted ticket whose merge-in conflicts waits for merge again, its accept cleared and no agent launched', async () => {
    harness = mergeApprovalHarness([{ id: '001', change: ['base.ts', 'export const base = 2;\n'] }]);
    commitFile(harness.repository, 'base.ts', 'export const base = 3;\n');
    const branchTip = harness.tipOf('ticket-001');
    harness.board.setTicketMergeAccepted('001', true, HARNESS_AT);
    await harness.slots.sweep();
    expect(harness.board.jobs()).toEqual([]);
    expect(harness.mergeAgent()).toBeUndefined();
    expect(harness.board.ticketIsMergeAccepted('001')).toBe(false);
    expect(harness.board.ticketIsMergeQueued('001')).toBe(true);
    expect(harness.tipOf('ticket-001')).toBe(branchTip);
    const ended = harness.board.logRecordsSoFar().findLast((record) => record.kind === 'job-ended');
    expect(ended?.kind === 'job-ended' ? ended.fields.cause : null).toBe('merge-accept-conflicted');
    expect(mergesStarted(harness)).toBe(1);
  });

  test('a red merged tree clears the accept and the review done, resumes no Airlock agent, and leaves the red handoff for the next reviewer', async () => {
    harness = mergeApprovalHarness([{ id: '001', change: ['checkout.ts', 'export const checkout = 1;\n'] }]);
    const review = harness.board.launchJob({
      kind: 'review', role: 'reviewer', ticketIds: ['001'], parentJobId: null, attempt: 1, target: 'main'
    }, HARNESS_AT);
    harness.board.endJob(review.job.id, { outcome: 'reviewed' }, HARNESS_AT);
    commitFile(harness.repository, 'cart.ts', 'export const cart = 1;\n');
    const mainTip = harness.tipOf('main');
    harness.board.setTicketMergeAccepted('001', true, HARNESS_AT);
    harness.settings.gateOutcome = 'failed';
    await harness.slots.sweep();
    expect(harness.tipOf('main')).toBe(mainTip);
    expect(harness.mergeAgent()).toBeUndefined();
    expect(harness.board.jobs()).toEqual([]);
    expect(harness.board.ticketIsMergeQueued('001')).toBe(false);
    expect(harness.board.ticketIsMergeAccepted('001')).toBe(false);
    expect(harness.board.tickets()[0]?.frontmatter.status).toBe('in-review');
    expect(existsSync(join(harness.repository, '.example-tracker', 'jobs', review.job.id, 'stale-green', 'red-handoff.json'))).toBe(true);
  });
});

describeWhenGitIsPresent('merge approval off', () => {
  test('a reviewed ticket with no accept lands as before', async () => {
    harness = createAirlocksHarness([{ id: '001', change: ['checkout.ts', 'export const checkout = 1;\n'] }]);
    harness.board.setApproval('merge', false, HARNESS_AT);
    await harness.slots.sweep();
    expect(harness.board.tickets()[0]?.frontmatter.status).toBe('delivered');
  });
});
