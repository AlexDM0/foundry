/**
 * The forge level's page. What matters: each approval reads its `pipeline.json` default while absent and its switch sends the other state,
 * the Ticket phase's as the route writes a ticket;
 * the merge train's re-review reads as its threshold or Off; the board limit is sent only when it changed and stays in its bounds, and
 * every count is worded in jobs; the footer counts the entities and their gates, and a root kept for a person is never "without gates".
 */
import { describe, expect, test }                      from 'bun:test';
import type { BoardPipelineDefinitionDocument }        from '../../../../@types/board/BoardPipelineDocuments.ts';
import { EXAMPLE_BOARD_LIMITS }                        from '../../../testing/PageLimitsFixture.ts';
import { exampleEntity, exampleGate, examplePipeline } from '../../../testing/PipelineFixture.ts';
import { ForgeLevelPageModel }                         from './ForgeLevelPageModel.ts';

const DRAFT: Pick<BoardPipelineDefinitionDocument, 'entities' | 'approvals' | 'airlock'> = examplePipeline({
  entities: {
    web:  exampleEntity('app', ['/apps/web'], { gates: [exampleGate('lint', 'lint')], phases: { build: ['lint'], review: [], merge: [] }, concurrency: 1 }),
    ui:   exampleEntity('package', ['/packages/ui']),
    root: exampleEntity('root', ['/']),
  },
});

const BOUNDS = EXAMPLE_BOARD_LIMITS.concurrency;

describe('the approvals', () => {
  test('read their defaults while absent, and a switch sends the other state', () => {
    const views = [...ForgeLevelPageModel.ticketPhaseApprovalViewsOf(DRAFT), ForgeLevelPageModel.mergeApprovalViewOf(DRAFT)];
    expect(views.map((view) => [view.approval, view.isOn])).toEqual([['tickets', true], ['merge', false]]);
    const merge = ForgeLevelPageModel.mergeApprovalViewOf(DRAFT);
    expect(merge.hint).toBe('Off: a green review goes straight to the merge train.');
    expect(ForgeLevelPageModel.approvalEditOf(merge)).toEqual({ target: 'approval', approval: 'merge', value: true });
    expect(ForgeLevelPageModel.ticketPhaseApprovalViewsOf({ approvals: { tickets: false } })[0]?.isOn).toBe(false);
  });

  test('of the Ticket phase follow the route: Human spec and plan review where a ticket is written as a spec, then a plan', () => {
    const views = ForgeLevelPageModel.ticketPhaseApprovalViewsOf({ approvals: { plan: false }, ticketWriting: 'spec-then-plan' });
    expect(views.map((view) => [view.title, view.isOn])).toEqual([['Human spec review', true], ['Human plan review', false]]);
    expect(views[1]?.hint).toBe('Off: the plan agent approves the plan when it is ready.');
  });

  test('the merge train\'s re-review reads as its threshold, or Off', () => {
    expect(ForgeLevelPageModel.conflictReReviewTextOf({ airlock: { reReview: { thresholdLines: 750 } } })).toBe('Over 750 lines');
    expect(ForgeLevelPageModel.conflictReReviewTextOf(DRAFT)).toBe('Off');
  });
});

describe('the board limit', () => {
  test('is sent only when it changed and stays in its bounds', () => {
    expect(ForgeLevelPageModel.boardLimitCommandOf(3, 2, BOUNDS)).toEqual({ boardCommandVersion: 2, kind: 'concurrency-set', limit: 3 });
    expect(ForgeLevelPageModel.boardLimitCommandOf(2, 2, BOUNDS)).toBeNull();
    expect(ForgeLevelPageModel.boardLimitCommandOf(BOUNDS.ceiling + 1, 2, BOUNDS)).toBeNull();
    expect(ForgeLevelPageModel.boardLimitCommandOf(BOUNDS.lowest - 1, 2, BOUNDS)).toBeNull();
  });

  test('reads its bounds from the limits the forge serves, never its own copy', () => {
    const narrowForge = { lowest: 2, ceiling: 3, defaultLimit: 2 };
    expect(ForgeLevelPageModel.boardLimitCommandOf(4, 2, narrowForge)).toBeNull();
    expect(ForgeLevelPageModel.boardLimitCommandOf(1, 2, narrowForge)).toBeNull();
    expect(ForgeLevelPageModel.boardLimitCommandOf(3, 2, narrowForge)).toEqual({ boardCommandVersion: 2, kind: 'concurrency-set', limit: 3 });
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
