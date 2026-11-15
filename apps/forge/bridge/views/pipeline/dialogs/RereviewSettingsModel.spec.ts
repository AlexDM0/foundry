/**
 * The conditional re-review's model. What matters: a stored `reReview` is on at its threshold, an absent one off at the default threshold;
 * Reset is on at the default (`DISPATCH_PROTOCOL`, 750 lines) with the re-reviewer's defaults and the constitution in its list; a form
 * switched off stores no `reReview`; the threshold steps by 50 from a minimum of 50; and each place has its own re-reviewer and words.
 */
import { describe, expect, test } from 'bun:test';

import type { Pipeline }         from '../../../../src/lib/tracker-model/@types/Pipeline.ts';
import { DISPATCH_PROTOCOL }     from '../../../../src/shared/constants/DispatchProtocol.ts';
import { RereviewSettingsModel } from './RereviewSettingsModel.ts';

const DRAFT: Pipeline = {
  version: 2,
  prepare: [],
  gates:   [],
  phases:  { build: [], review: [], merge: [] },
  agents:  { reReviewer: { model: 'sonnet', effort: 'high' } },
};

describe('the form', () => {
  test('a stored re-review is on at its threshold, with the re-reviewer\'s stored pair', () => {
    const form = RereviewSettingsModel.formOf('review', { thresholdLines: 300 }, DRAFT, null);
    expect(form).toMatchObject({ isOn: true, thresholdLines: 300, settings: { model: 'sonnet', effort: 'high' } });
  });

  test('an absent one is off at the default threshold', () => {
    expect(RereviewSettingsModel.formOf('merge', undefined, DRAFT, null)).toMatchObject({ isOn: false, thresholdLines: DISPATCH_PROTOCOL.REWORK_ROUND_THRESHOLD_LINES });
  });

  test('Reset is on at 750 lines, with the constitution first in the re-reviewer\'s list', () => {
    const reset = RereviewSettingsModel.resetFormOf('review');
    expect(reset).toMatchObject({ isOn: true, thresholdLines: 750 });
    expect(reset.settings.entries[0]).toEqual({ kind: 'constitution' });
  });

  test('switched off it stores no re-review; on, its threshold', () => {
    const form = RereviewSettingsModel.formOf('review', { thresholdLines: 300 }, DRAFT, null);
    expect(RereviewSettingsModel.reReviewOf(form)).toEqual({ thresholdLines: 300 });
    expect(RereviewSettingsModel.reReviewOf({ ...form, isOn: false })).toBeUndefined();
  });

  test('the threshold steps by 50 and stops at 50', () => {
    expect([RereviewSettingsModel.THRESHOLD_STEP_LINES, RereviewSettingsModel.THRESHOLD_MINIMUM_LINES]).toEqual([50, 50]);
  });
});

describe('the places', () => {
  test('the review\'s re-reviewer and the merge\'s conflict re-reviewer, each with its words', () => {
    expect([RereviewSettingsModel.roleOf('review'), RereviewSettingsModel.roleOf('merge')]).toEqual(['reReviewer', 'conflictReReviewer']);
    expect(RereviewSettingsModel.wordsOf('merge').offNote).toBe('Off: the Re-review step leaves the merge train, and a conflict fix goes straight to the merge gates.');
    expect(RereviewSettingsModel.wordsOf('merge').scopeNote).toBeNull();
    expect(RereviewSettingsModel.wordsOf('review').scopeNote).not.toBeNull();
  });
});
