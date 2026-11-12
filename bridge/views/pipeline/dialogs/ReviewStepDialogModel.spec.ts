/**
 * The review step dialog's model. What matters: a Save sends the reviewer, the re-reviewer only while the re-review is on, and the review
 * keeping its name, with its `reReview` while on and without it when off; Remove review is the one `review: null` edit.
 */
import { describe, expect, test } from 'bun:test';

import { AgentStepDialogModel }  from './AgentStepDialogModel.ts';
import { RereviewSettingsModel } from './RereviewSettingsModel.ts';
import { ReviewStepDialogModel } from './ReviewStepDialogModel.ts';

const REVIEWER_FORM = AgentStepDialogModel.resetFormOf('reviewer');

const RE_REVIEW_ON = RereviewSettingsModel.resetFormOf('review');

describe('a Save', () => {
  test('while the re-review is on: the reviewer, the re-reviewer and the review with its re-review', () => {
    const edits = ReviewStepDialogModel.saveEditsOf({ name: 'example-review' }, REVIEWER_FORM, RE_REVIEW_ON);
    expect(edits.map((edit) => edit.field)).toEqual(['role:reviewer', 'role:reReviewer', 'review']);
    expect(edits.at(-1)?.value).toEqual({ name: 'example-review', reReview: { thresholdLines: 750 } });
  });

  test('while it is off: the review drops its re-review, and the re-reviewer is not sent', () => {
    const edits = ReviewStepDialogModel.saveEditsOf({ name: 'example-review', reReview: { thresholdLines: 300 } }, REVIEWER_FORM, { ...RE_REVIEW_ON, isOn: false });
    expect(edits.map((edit) => edit.field)).toEqual(['role:reviewer', 'review']);
    expect(edits.at(-1)?.value).toEqual({ name: 'example-review' });
  });
});

test('Remove review is one edit with value null', () => {
  expect(ReviewStepDialogModel.removeEditsOf()).toEqual([{ field: 'review', value: null }]);
});
