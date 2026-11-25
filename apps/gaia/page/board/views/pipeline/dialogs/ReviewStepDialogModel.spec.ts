/**
 * The review step dialog's model. What matters: a Save sends the reviewer, the re-reviewer only while the re-review is on, and the review
 * keeping its name, with its `reReview` while on and without it when off; Remove review is the one `review: null` edit.
 */
import { describe, expect, test } from 'bun:test';

import { EXAMPLE_BOARD_LIMITS }  from '../../../testing/PageLimitsFixture.ts';
import { AgentStepDialogModel }  from './AgentStepDialogModel.ts';
import { RereviewSettingsModel } from './RereviewSettingsModel.ts';
import { ReviewStepDialogModel } from './ReviewStepDialogModel.ts';

const REVIEWER_FORM = AgentStepDialogModel.resetFormOf('reviewer', EXAMPLE_BOARD_LIMITS);

const RE_REVIEW_ON = RereviewSettingsModel.resetFormOf('review', EXAMPLE_BOARD_LIMITS);

describe('a Save', () => {
  test('while the re-review is on: the reviewer, the re-reviewer and the review with its re-review', () => {
    const edits = ReviewStepDialogModel.saveEditsOf({ name: 'example-review', reReview: null }, REVIEWER_FORM, RE_REVIEW_ON, EXAMPLE_BOARD_LIMITS);
    expect(edits.map((edit) => edit.target)).toEqual(['role', 'role', 'review']);
    expect(edits.at(-1)).toEqual({ target: 'review', value: { name: 'example-review', reReview: { thresholdLines: EXAMPLE_BOARD_LIMITS.reworkRoundThresholdLines } } });
  });

  test('while it is off: the review drops its re-review, and the re-reviewer is not sent', () => {
    const review = { name: 'example-review', reReview: { thresholdLines: 300 } };
    const edits = ReviewStepDialogModel.saveEditsOf(review, REVIEWER_FORM, { ...RE_REVIEW_ON, isOn: false }, EXAMPLE_BOARD_LIMITS);
    expect(edits.map((edit) => edit.target)).toEqual(['role', 'review']);
    expect(edits.at(-1)).toEqual({ target: 'review', value: { name: 'example-review', reReview: null } });
  });
});

test('Remove review is one edit with value null', () => {
  expect(ReviewStepDialogModel.removeEditsOf()).toEqual([{ target: 'review', value: null }]);
});
