/**
 * The Merge queue detail's model. What matters: the order is the forge's, kept as it arrives; the Airlock holder reads with its phase;
 * each candidate's prediction takes its pill's word and palette row, its conflicted files apart, its priority the served one, and the
 * pairwise conflicts are worded; a target's landings name the `target-moved` decision and, in the forge's own sentence, the notice of the
 * main checkout or a held file they wait on, including a target that has nothing queued; the order is worded as five keys, or as User's
 * press order when the applied pipeline turns merge approval on.
 */
import { describe, expect, test } from 'bun:test';

import { DIRTY_CHECKOUT_NOTICE, QUEUED_TARGET } from '../../testing/BoardStateFixture.ts';
import { EXAMPLE_BOARD_LIMITS }                 from '../../testing/PageLimitsFixture.ts';
import { pipelineBoardStateOf }                 from '../../testing/PipelineFixture.ts';

const NO_TARGETS = { targets: [] } as const;
import { MergeQueueModel } from './MergeQueueModel.ts';

describe('a queued target', () => {
  const [target] = MergeQueueModel.mergeQueueModelOf({ targets: [QUEUED_TARGET] }, [DIRTY_CHECKOUT_NOTICE]);

  test('keeps the forge\'s five-key order and words each prediction', () => {
    expect(target?.lines).toEqual([
      {
        position:            1,
        ticketId:            '8',
        priority:            'high',
        forecast:            'clean',
        forecastLabel:       'clean',
        forecastState:       'reviewed',
        conflictedFilesText: null,
        causesText:          'would conflict with 1 clean candidate',
      },
      {
        position:            2,
        ticketId:            '9',
        priority:            'normal',
        forecast:            'conflicting',
        forecastLabel:       'conflicting',
        forecastState:       'draft',
        conflictedFilesText: 'src/Example.ts',
        causesText:          null,
      },
    ]);
  });

  test('names the Airlock holder and its phase, the pairwise conflicts, and what its landings wait on', () => {
    expect([target?.holderText, target?.phase]).toEqual(['J12 for #7 holds the Airlock: gating', 'gating']);
    expect(target?.pairwiseTexts).toEqual(['#8 and #10 conflict with each other']);
    expect(target?.waitingReasons).toEqual([
      'landings wait on the target-moved decision E4',
      DIRTY_CHECKOUT_NOTICE.text,
    ]);
  });
});

describe('a target only a notice names', () => {
  test('shows with a free Airlock and the forge\'s sentence for why its landings wait', () => {
    const notice = { ...DIRTY_CHECKOUT_NOTICE, facts: { target: 'group-example', branch: 'main', blockingFiles: [] }, text: 'Example sentence of the forge' };
    expect(MergeQueueModel.mergeQueueModelOf(NO_TARGETS, [notice])).toEqual([{
      target:         'group-example',
      holderText:     'Airlock free',
      phase:          null,
      lines:          [],
      pairwiseTexts:  [],
      waitingReasons: ['Example sentence of the forge'],
    }]);
  });

  test('a file held open by another process names its target too, and a notice naming no target holds none', () => {
    const held = {
      kind: 'target-file-held', facts: { target: 'main', heldFiles: ['README.md'] }, text: 'Example held-file sentence', causeText: null
    };
    const targetless = { ...held, facts: { heldFiles: ['README.md'] }, text: 'Example targetless sentence' };
    const targets = MergeQueueModel.mergeQueueModelOf(NO_TARGETS, [held, targetless]);
    expect(targets.map((target) => [target.target, target.waitingReasons])).toEqual([['main', ['Example held-file sentence']]]);
  });

  test('a failed prediction reads as failed, on the idle row, with no files', () => {
    expect(MergeQueueModel.forecastFactsOf({
      ticketId: '1', priority: 'low', againstTarget: 'prediction-failed', conflictedFiles: null
    })).toEqual({
      forecast: 'prediction-failed', forecastLabel: 'prediction failed', forecastState: 'paused', conflictedFilesText: null
    });
  });
});

describe('the order text', () => {
  test('names the five keys, and User\'s press order only when the applied pipeline turns merge approval on', () => {
    const approving = pipelineBoardStateOf('flow-human-code-review-live').pipeline.applied;
    if (approving.readingVerdict !== 'readable') throw new Error('the fixture has no readable pipeline');
    const notApproving = { ...approving, pipeline: { ...approving.pipeline, approvals: { tickets: true, merge: false } } };
    expect([
      MergeQueueModel.orderTextOf(approving, EXAMPLE_BOARD_LIMITS),
      MergeQueueModel.orderTextOf(notApproving, EXAMPLE_BOARD_LIMITS),
      MergeQueueModel.orderTextOf({ readingVerdict: 'absent' }, EXAMPLE_BOARD_LIMITS),
    ]).toEqual([
      'Ordered by User\'s Merge presses, earliest first, then ticket id.',
      'Ordered by priority, clean before conflicting, fewest conflicts caused, readiness, then ticket id.',
      'Ordered by priority, clean before conflicting, fewest conflicts caused, readiness, then ticket id.',
    ]);
  });
});
