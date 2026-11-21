/**
 * The merge train's conditional re-review of a conflict resolution, with the harness's fake gate and fake launcher. What matters: a sound
 * resolution that changed more lines than `airlock.reReview.thresholdLines` ends its resolver and runs a fresh conflict re-reviewer in the
 * Airlock's `re-reviewing` phase before the merge gates; one at or below the threshold, or any resolution with no `airlock.reReview`, goes
 * straight to the gates; a resolution whose size git cannot tell is re-reviewed (fail closed); a re-review that leaves a claim not holding
 * refuses the merge with its own cause; and a red merged tree after a re-review resumes the conflict re-reviewer, the last worker on the
 * code, never a new agent. The folders are real; git answers from the recorded answer sets of
 * `src/services/hephaestus/testing/AirlockAnswerSets.ts`.
 */
import { afterEach, expect, test } from 'bun:test';

import { ancestryAsked }             from '../../testing/RecordedAirlockGit.ts';
import { useRecordedGit }            from '../../testing/RecordedGit.ts';
import { describeWhenGitIsRecorded } from '../../testing/ToolGuard.ts';
import { AirlockAnswerSets }         from './testing/AirlockAnswerSets.ts';
import {
  createRecordedAirlocksHarness,
  finishMergeAgent,
  HARNESS_AT,
  RECORDED_AIRLOCK_IDS,
  type AirlocksHarness
} from './testing/AirlocksHarness.ts';

const recordedGit = useRecordedGit();

const { MERGED_TIP } = RECORDED_AIRLOCK_IDS;

const EXAMPLE_THRESHOLD_LINES = 800;

const RESOLVED_REPORT = {
  outcome: 'resolved', resolvedFiles: ['shared.txt'], notes: '', reportKind: null
} as const;

let harness: AirlocksHarness | null = null;

afterEach(() => {
  harness?.remove();
  harness = null;
});

function reReviewReport(result: 'holds' | 'does-not-hold'): Record<string, unknown> {
  return {
    role:       'reviewer',
    headCommit: MERGED_TIP,
    claims:     [{
      item: 'A1', result, handoffContradicted: false, note: ''
    }],
    findings:   [],
    reviewText: 'Example re-review of the resolution.',
  };
}

/** A ticket whose reviewer ended its review, so it is the last worker, in a merge train with the re-review on or off. */
function reviewedHarness(reReviewIsOn: boolean): AirlocksHarness {
  const current = createRecordedAirlocksHarness([{ id: '001' }], {}, true, reReviewIsOn ? { reReview: { thresholdLines: EXAMPLE_THRESHOLD_LINES } } : {});
  const review = current.board.launchJob({
    kind: 'review', role: 'reviewer', ticketIds: ['001'], parentJobId: null, attempt: 1, target: 'main'
  }, HARNESS_AT);
  current.board.endJob(review.job.id, { outcome: 'reviewed' }, HARNESS_AT);
  return current;
}

/** The merge-in conflicts, its last worker resolves it, and the slot settles the resolution of `resolutionLines` lines. */
async function resolved(current: AirlocksHarness, resolutionLines: number | null): Promise<void> {
  recordedGit.answerFrom(AirlockAnswerSets.conflictingMergeIn('001'));
  await current.slots.sweep();
  current.settings.resolutionLines = resolutionLines;
  recordedGit.answerFrom([...AirlockAnswerSets.resolvedAndMerged(), ancestryAsked(MERGED_TIP, 'HEAD', true)]);
  finishMergeAgent(current, RESOLVED_REPORT);
  await current.slots.sweep();
}

function launchedRoles(current: AirlocksHarness): unknown[] {
  return current.board.logRecordsSoFar().flatMap((record) => (record.kind === 'job-launched' && record.fields.kind === 'merge-agent' ? [record.fields.role] : []));
}

function endedCausesOf(current: AirlocksHarness): unknown[] {
  return current.board.logRecordsSoFar().flatMap((record) => (record.kind === 'job-ended' ? [record.fields.cause ?? record.fields.outcome] : []));
}

describeWhenGitIsRecorded('a resolution above the merge train\'s threshold', () => {
  test('ends its resolver and runs a fresh conflict re-reviewer in re-reviewing; a re-review that holds goes on to the gates and lands', async () => {
    harness = reviewedHarness(true);
    await resolved(harness, EXAMPLE_THRESHOLD_LINES + 1);

    expect(harness.mergeJob()?.airlock?.phase).toBe('re-reviewing');
    expect(harness.mergeAgent()).toMatchObject({ role: 'conflict-re-reviewer', attempt: 1, state: 'launching' });
    expect(launchedRoles(harness)).toEqual(['reviewer', 'conflict-re-reviewer']);
    expect(harness.gatedTrees).toEqual([]);

    finishMergeAgent(harness, reReviewReport('holds'));
    await harness.slots.sweep();

    expect(harness.gatedPhases).toEqual(['merge']);
    expect(harness.board.tickets()[0]?.frontmatter.status).toBe('delivered');
  });

  test('is re-reviewed when git cannot tell its size', async () => {
    harness = reviewedHarness(true);
    await resolved(harness, null);

    expect(harness.mergeJob()?.airlock?.phase).toBe('re-reviewing');
    expect(harness.mergeAgent()).toMatchObject({ role: 'conflict-re-reviewer' });
  });

  test('refuses the merge with cause re-review-failed when a claim still does not hold after the re-review', async () => {
    harness = reviewedHarness(true);
    await resolved(harness, EXAMPLE_THRESHOLD_LINES + 1);
    recordedGit.answerFrom([
      ...AirlockAnswerSets.resolvedAndMerged(), ancestryAsked(MERGED_TIP, 'HEAD', true), ...AirlockAnswerSets.stoppedOnTheConflict(false),
    ]);

    finishMergeAgent(harness, reReviewReport('does-not-hold'));
    await harness.slots.sweep();

    expect(harness.board.airlockHolderOf('main')).toBeUndefined();
    expect(harness.board.decisions().map((decision) => [decision.kind, decision.ticketIds])).toEqual([['merge-refused', ['001']]]);
    expect(endedCausesOf(harness)).toContain('re-review-failed');
    expect(harness.gatedTrees).toEqual([]);
  });

  test('a red merged tree after the re-review resumes the conflict re-reviewer with the red handoff, launching no other agent', async () => {
    harness = reviewedHarness(true);
    await resolved(harness, EXAMPLE_THRESHOLD_LINES + 1);
    const reReviewer = harness.mergeAgent();
    harness.settings.gateOutcome = 'failed';

    finishMergeAgent(harness, reReviewReport('holds'));
    await harness.slots.sweep();

    expect(harness.mergeJob()?.airlock?.phase).toBe('fixing');
    expect(harness.mergeAgent()).toMatchObject({ id: reReviewer?.id, state: 'interrupted', interruption: 'handoff-red' });
    expect(launchedRoles(harness)).toEqual(['reviewer', 'conflict-re-reviewer']);
  });
});

describeWhenGitIsRecorded('a resolution the merge train does not re-review', () => {
  test.each([
    ['at the threshold', true, EXAMPLE_THRESHOLD_LINES],
    ['with no re-review in the merge train, however large', false, Number.MAX_SAFE_INTEGER],
  ])('%s goes straight to the gates with its resolver waiting through them', async (_case, reReviewIsOn, resolutionLines) => {
    harness = reviewedHarness(reReviewIsOn);
    await resolved(harness, resolutionLines);

    expect(launchedRoles(harness)).toEqual(['reviewer']);
    expect(harness.gatedPhases).toEqual(['merge']);
    expect(harness.board.tickets()[0]?.frontmatter.status).toBe('delivered');
  });
});
