/**
 * Which pipeline's review sets the rework threshold of a ticket that crosses into no package. What matters: on a pipeline with entities it
 * is the ticket's own entity's review, never the forge's top level, which such a pipeline leaves without a review; an entity whose review
 * has no re-review grants no round and shows no ticket of it as not converging; a crossing ticket's newest review on a package stage is
 * measured against the reviewing package's threshold, as Settle measured it; and a pipeline without entities reads its own review as
 * before.
 */
import { describe, expect, test } from 'bun:test';

import type { LogRecord }                from '../../domain/tracker-model/@types/LogRecord.ts';
import type { Pipeline, PipelineEntity } from '../../domain/tracker-model/@types/Pipeline.ts';
import type { Board }                    from '../../domain/tracker-model/Board.ts';
import { RoundVerdictUtil }              from '../../domain/tracker-model/utils/RoundVerdictUtil.ts';
import { TicketStageUtil }               from '../../domain/tracker-model/utils/TicketStageUtil.ts';
import { LIFECYCLE_LIMITS }              from '../../shared/constants/LifecycleLimits.ts';
import { boardFixture, ticketFixture }   from '../../testing/BoardFixtures.ts';
import { ReviewOutcome }                 from './ReviewOutcome.ts';

const AT = '2026-11-18T10:00:00+01:00';
const WEB_THRESHOLD_LINES = 900;
const TOP_LEVEL_THRESHOLD_LINES = 800;

function appEntityOf(home: string, review: PipelineEntity['review']): PipelineEntity {
  return {
    kind: 'app', home: [home], prepare: [], gates: [], phases: { build: [], review: [], merge: [] }, ...(review === undefined ? {} : { review })
  };
}

const ENTITIES_PIPELINE: Pipeline = {
  version:  5,
  prepare:  [],
  gates:    [],
  phases:   { build: [], review: [], merge: [] },
  entities: {
    'web': appEntityOf('/apps/web', { name: 'Review', reReview: { thresholdLines: WEB_THRESHOLD_LINES } }),
    'api': appEntityOf('/apps/api', { name: 'Review' }),
    'ui':  { ...appEntityOf('/packages/ui', { name: 'Review' }), kind: 'package' },
  },
};

const SINGLE_PIPELINE: Pipeline = {
  version: 5,
  prepare: [],
  gates:   [],
  phases:  { build: [], review: [], merge: [] },
  review:  { name: 'Review', reReview: { thresholdLines: TOP_LEVEL_THRESHOLD_LINES } },
};

function boardOf(pipeline: Pipeline): Board {
  const tickets = [
    ticketFixture({ id: '001', status: 'in-review', entity: 'web' }),
    ticketFixture({ id: '002', status: 'in-review', entity: 'web' }),
    ticketFixture({ id: '003', status: 'in-review', entity: 'api' }),
  ];
  return boardFixture({ tickets, pipeline }).board;
}

function reworkThresholdOfReviewOf(board: Board, ticketId: string, entity: string | undefined): number | null {
  const ownReviewStage = entity === undefined ? {} : { entity, stage: TicketStageUtil.stageNumberOf('review') };
  const { job } = board.launchJob({
    kind: 'review', role: 'reviewer', ticketIds: [ticketId], parentJobId: null, attempt: 1, target: 'main', ...ownReviewStage
  }, AT);
  return RoundVerdictUtil.roundLimitsOf(ReviewOutcome.reviewingPipelineOf(board, job), LIFECYCLE_LIMITS).REWORK_ROUND_THRESHOLD_LINES;
}

function reviewRecordedOf(ticketId: string, totalReworkedCodeLines: number, barTaskId = 1): LogRecord {
  return {
    at:     AT,
    kind:   'review-recorded',
    taskId: barTaskId,
    ticketId,
    fields: {
      round:                   1,
      verdict:                 'released',
      reviewStartCommit:       'def5678',
      fixReworkedCodeLines:    totalReworkedCodeLines,
      rebaseReworkedCodeLines: 0,
      totalReworkedCodeLines,
      builderChangedFiles:     1,
      builderInsertions:       10,
      builderDeletions:        0,
      claims:                  [],
      findings:                [],
    },
  };
}

describe('the rework threshold of a review of a ticket that crosses into no package', () => {
  test('is its own entity\'s re-review threshold on a pipeline with entities, not the forge\'s top level', () => {
    const board = boardOf(ENTITIES_PIPELINE);
    expect(board.ticketStageOf('001')).toBeNull();
    expect(reworkThresholdOfReviewOf(board, '001', 'web')).toBe(WEB_THRESHOLD_LINES);
  });

  test('is none for an entity whose review has no re-review, so no round is granted', () => {
    expect(reworkThresholdOfReviewOf(boardOf(ENTITIES_PIPELINE), '003', 'api')).toBeNull();
  });

  test('is the pipeline\'s own on a pipeline without entities, whatever entity the ticket names', () => {
    expect(reworkThresholdOfReviewOf(boardOf(SINGLE_PIPELINE), '001', undefined)).toBe(TOP_LEVEL_THRESHOLD_LINES);
  });
});

describe('the tickets shown as not converging', () => {
  const RECORDS = [reviewRecordedOf('001', WEB_THRESHOLD_LINES + 1), reviewRecordedOf('002', WEB_THRESHOLD_LINES), reviewRecordedOf('003', 5000)];

  test('measure each ticket against its own entity\'s threshold on a pipeline with entities', () => {
    const board = boardOf(ENTITIES_PIPELINE);
    expect(ReviewOutcome.nonConvergingTicketIdsOf(RECORDS, (record) => ReviewOutcome.recordedReviewPipelineOf(board, record), LIFECYCLE_LIMITS)).toEqual(['001']);
  });

  test('measure every ticket against the pipeline\'s own threshold on a pipeline without entities', () => {
    const board = boardOf(SINGLE_PIPELINE);
    expect(ReviewOutcome.nonConvergingTicketIdsOf(RECORDS, (record) => ReviewOutcome.recordedReviewPipelineOf(board, record), LIFECYCLE_LIMITS)).toEqual(['001', '002', '003']);
  });

  test('measure a crossing ticket\'s newest review on a package stage against the package\'s threshold, not its own entity\'s', () => {
    const board = boardOf(ENTITIES_PIPELINE);
    const { bar } = board.startReviewBar('001', { round: 1, stage: { name: 'package-review', entity: 'ui' } }, AT);
    const records = [reviewRecordedOf('001', WEB_THRESHOLD_LINES + 100, bar.id)];
    expect(ReviewOutcome.nonConvergingTicketIdsOf(records, (record) => ReviewOutcome.recordedReviewPipelineOf(board, record), LIFECYCLE_LIMITS)).toEqual([]);
  });
});
