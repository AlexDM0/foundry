/**
 * The conditional re-review's model: on or off from the stored `reReview`, Reset to the forge's served rework threshold and defaults,
 * no `reReview` stored when off, the threshold stepping by the served step, and each place's own re-reviewer and words.
 */
import { describe, expect, test }               from 'bun:test';
import type { BoardPipelineDefinitionDocument } from '../../../../@types/board/BoardPipelineDocuments.ts';
import { EXAMPLE_BOARD_LIMITS }                 from '../../../testing/PageLimitsFixture.ts';
import { examplePipeline }                      from '../../../testing/PipelineFixture.ts';
import { RereviewSettingsModel }                from './RereviewSettingsModel.ts';

const DRAFT: BoardPipelineDefinitionDocument = examplePipeline({ agents: { reReviewer: { model: 'sonnet', effort: 'high', instructions: null } } });

const LIMITS = EXAMPLE_BOARD_LIMITS;

/** A forge whose rework threshold and threshold step differ from the example's, so a value read from elsewhere shows. */
const OTHER_FORGE_LIMITS = { ...LIMITS, reworkRoundThresholdLines: 900, reReviewThresholdStepLines: 25 };

describe('the form', () => {
  test('a stored re-review is on at its threshold, with the re-reviewer\'s stored pair', () => {
    const form = RereviewSettingsModel.formOf('review', { thresholdLines: 300 }, DRAFT, null, LIMITS);
    expect(form).toMatchObject({ isOn: true, thresholdLines: 300, settings: { model: 'sonnet', effort: 'high' } });
  });

  test('an absent one is off at the default threshold', () => {
    expect(RereviewSettingsModel.formOf('merge', null, DRAFT, null, LIMITS)).toMatchObject({ isOn: false, thresholdLines: LIMITS.reworkRoundThresholdLines });
    expect(RereviewSettingsModel.formOf('merge', null, DRAFT, null, OTHER_FORGE_LIMITS)).toMatchObject({ isOn: false, thresholdLines: 900 });
  });

  test('Reset is on at the served rework threshold, with the constitution first in the re-reviewer\'s list', () => {
    const reset = RereviewSettingsModel.resetFormOf('review', OTHER_FORGE_LIMITS);
    expect(reset).toMatchObject({ isOn: true, thresholdLines: 900 });
    expect(reset.settings.entries[0]).toEqual({ kind: 'constitution' });
  });

  test('switched off it stores no re-review; on, its threshold', () => {
    const form = RereviewSettingsModel.formOf('review', { thresholdLines: 300 }, DRAFT, null, LIMITS);
    expect(RereviewSettingsModel.reReviewOf(form)).toEqual({ thresholdLines: 300 });
    expect(RereviewSettingsModel.reReviewOf({ ...form, isOn: false })).toBeNull();
  });

  test('the threshold steps by the step the forge serves, and stops at one step', () => {
    expect(RereviewSettingsModel.thresholdStepLinesOf(LIMITS)).toBe(LIMITS.reReviewThresholdStepLines);
    expect(RereviewSettingsModel.thresholdStepLinesOf(OTHER_FORGE_LIMITS)).toBe(25);
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
