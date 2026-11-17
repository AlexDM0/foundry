/**
 * The forge level's page. What matters: each approval reads its `pipeline.json` default while absent and its switch sends the other state;
 * the merge train's re-review reads as its threshold or Off; the board limit is sent only when it changed and stays in its bounds, and
 * every count is worded in jobs; the footer counts the entities and their gates, and a root kept for a person is never "without gates".
 */
import { describe, expect, test } from 'bun:test';

import type { Pipeline }       from '../../../../src/lib/tracker-model/@types/Pipeline.ts';
import { ForgeLevelPageModel } from './ForgeLevelPageModel.ts';

const DRAFT: Pick<Pipeline, 'entities' | 'approvals' | 'airlock'> = {
  entities: {
    web: {
      kind: 'app', home: ['/apps/web'], prepare: [], gates: [{ name: 'lint', run: 'lint' }], phases: { build: ['lint'], review: [], merge: [] }, concurrency: 1,
    },
    ui: {
      kind: 'package', home: ['/packages/ui'], prepare: [], gates: [], phases: { build: [], review: [], merge: [] }
    },
    root: {
      kind: 'root', home: ['/'], prepare: [], gates: [], phases: { build: [], review: [], merge: [] }
    },
  },
};

describe('the approvals', () => {
  test('read their defaults while absent, and a switch sends the other state', () => {
    const views = ForgeLevelPageModel.approvalViewsOf(DRAFT);
    expect(views.map((view) => [view.approval, view.isOn])).toEqual([['tickets', true], ['merge', false]]);
    expect(views[1]?.hint).toBe('Off: a green review goes straight to the merge train.');
    const merge = views[1];
    if (merge === undefined) throw new Error('no merge approval');
    expect(ForgeLevelPageModel.approvalEditOf(merge)).toEqual({ field: 'approval:merge', value: true });
    expect(ForgeLevelPageModel.approvalViewsOf({ approvals: { tickets: false } })[0]?.isOn).toBe(false);
  });

  test('the merge train\'s re-review reads as its threshold, or Off', () => {
    expect(ForgeLevelPageModel.conflictReReviewTextOf({ airlock: { reReview: { thresholdLines: 750 } } })).toBe('Over 750 lines');
    expect(ForgeLevelPageModel.conflictReReviewTextOf(DRAFT)).toBe('Off');
  });
});

describe('the board limit', () => {
  test('is sent only when it changed and stays in its bounds', () => {
    expect(ForgeLevelPageModel.boardLimitCommandOf(3, 2)).toEqual({ kind: 'concurrency-set', limit: 3 });
    expect(ForgeLevelPageModel.boardLimitCommandOf(2, 2)).toBeNull();
    expect(ForgeLevelPageModel.boardLimitCommandOf(ForgeLevelPageModel.HIGHEST_BOARD_LIMIT + 1, 2)).toBeNull();
    expect(ForgeLevelPageModel.boardLimitCommandOf(ForgeLevelPageModel.LOWEST_BOARD_LIMIT - 1, 2)).toBeNull();
  });

  test('and every entity cap are worded in jobs', () => {
    expect(ForgeLevelPageModel.jobsAtOnceTextOf(1)).toBe('1 job at once');
    expect(ForgeLevelPageModel.jobsAtOnceTextOf(2)).toBe('2 jobs at once');
    expect(ForgeLevelPageModel.entityCapLinesOf(DRAFT)).toEqual(['web: a cap of 1 job']);
  });
});

describe('the footer', () => {
  test('counts the entities and their gates; a root kept for a person is not without gates', () => {
    expect(ForgeLevelPageModel.footerSummaryOf(DRAFT)).toBe('3 entities · 1 gate · 1 entity without gates');
    expect(ForgeLevelPageModel.footerSummaryOf(null)).toBe('0 entities · 0 gates');
  });
});
