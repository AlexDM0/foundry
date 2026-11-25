/**
 * The merge step dialog's model. What matters: the head follows the merge's placement; the conflict line names the last worker, or the
 * builder when no review runs; a Save sends the merge train with its `reReview` while on and without it when off, and the conflict
 * re-reviewer only while on.
 */
import { describe, expect, test } from 'bun:test';

import { EXAMPLE_BOARD_LIMITS }  from '../../../testing/PageLimitsFixture.ts';
import { MergeStepDialogModel }  from './MergeStepDialogModel.ts';
import { RereviewSettingsModel } from './RereviewSettingsModel.ts';

const RE_REVIEW_ON = RereviewSettingsModel.resetFormOf('merge', EXAMPLE_BOARD_LIMITS);

describe('the words', () => {
  test('the head follows the placement', () => {
    expect(MergeStepDialogModel.headOf('airlock').kicker).toBe('Merge · Merge train step');
    expect(MergeStepDialogModel.headOf('before-human-code-review').kicker).toBe('Review · Merge step');
    expect(MergeStepDialogModel.headOf('airlock').title).toBe('Merge main into the tree');
  });

  test('conflicts go to the last worker, or to the builder when no review runs', () => {
    expect(MergeStepDialogModel.conflictTextOf('last-worker')).toContain('the last worker');
    expect(MergeStepDialogModel.conflictTextOf('builder')).toContain('the builder');
  });
});

describe('a Save', () => {
  test('while on: the merge train with its re-review, then the conflict re-reviewer', () => {
    const edits = MergeStepDialogModel.saveEditsOf({ ...RE_REVIEW_ON, thresholdLines: 400 }, EXAMPLE_BOARD_LIMITS);
    expect(edits).toEqual([
      { target: 'airlock', value: { reReview: { thresholdLines: 400 } } },
      {
        target: 'role',
        role:   'conflictReReviewer',
        value:  { model: RE_REVIEW_ON.settings.model, effort: RE_REVIEW_ON.settings.effort, instructions: [...RE_REVIEW_ON.settings.entries] },
      },
    ]);
  });

  test('while off: the merge train without its re-review, and no re-reviewer', () => {
    expect(MergeStepDialogModel.saveEditsOf({ ...RE_REVIEW_ON, isOn: false }, EXAMPLE_BOARD_LIMITS)).toEqual([{ target: 'airlock', value: { reReview: null } }]);
  });
});
