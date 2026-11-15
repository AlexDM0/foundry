/**
 * The Merge queue detail's model. What matters: the order is the Overseer's, kept as it arrives; the Airlock holder reads with its phase;
 * each candidate's prediction takes its pill's word and palette row, its conflicted files apart, an unknown priority
 * reads as normal, and the pairwise conflicts are worded; and a target's landings name the `target-moved` decision and the
 * `dirty-main-checkout` notice they wait on, including a target that has nothing queued; the order is worded as five keys, or as User's
 * press order when the applied pipeline turns merge approval on.
 */
import { describe, expect, test } from 'bun:test';

import { DIRTY_CHECKOUT_NOTICE, QUEUED_TARGET } from '../../testing/BoardStateFixture.ts';
import { pipelineBoardStateOf }                 from '../../testing/PipelineFixture.ts';
import { MergeQueueModel }                      from './MergeQueueModel.ts';

describe('a queued target', () => {
  const [target] = MergeQueueModel.mergeQueueModelOf({ targets: [QUEUED_TARGET] }, [DIRTY_CHECKOUT_NOTICE]);

  test('keeps the Overseer\'s five-key order and words each prediction', () => {
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
      'landings wait: the main checkout\'s changes to README.md block the fast-forward',
    ]);
  });
});

describe('a target only a notice names', () => {
  test('shows with a free Airlock and the reason its landings wait', () => {
    expect(MergeQueueModel.mergeQueueModelOf(undefined, [{ ...DIRTY_CHECKOUT_NOTICE, target: 'group-example', blockingFiles: [] }])).toEqual([{
      target:         'group-example',
      holderText:     'Airlock free',
      phase:          null,
      lines:          [],
      pairwiseTexts:  [],
      waitingReasons: ['landings wait: the main checkout is on main'],
    }]);
  });

  test('a file held open by another process reads as held, never as the main checkout\'s changes', () => {
    const [target] = MergeQueueModel.mergeQueueModelOf(undefined, [{ kind: 'target-file-held', target: 'main', heldFiles: ['README.md'] }]);
    expect(target?.waitingReasons).toEqual(['landings wait: another process holds README.md open, so git cannot replace what is held']);
  });

  test('a priority the Bridge does not know reads as normal', () => {
    const [target] = MergeQueueModel.mergeQueueModelOf({
      targets: [{
        ...QUEUED_TARGET,
        order: [{
          ticketId: '8', priority: 'urgent', againstTarget: 'clean', conflictedFiles: [], conflictsCaused: 0
        }]
      }]
    }, []);
    expect(target?.lines.map((line) => line.priority)).toEqual(['normal']);
  });

  test('a failed prediction reads as failed, on the idle row, with no files', () => {
    expect(MergeQueueModel.forecastFactsOf({
      ticketId: '1', priority: 'low', againstTarget: 'prediction-failed', conflictedFiles: null, conflictsCaused: 0
    })).toEqual({
      forecast: 'prediction-failed', forecastLabel: 'prediction failed', forecastState: 'paused', conflictedFilesText: null
    });
  });
});

describe('the order text', () => {
  test('names the five keys, and User\'s press order only when the applied pipeline turns merge approval on', () => {
    const approving = pipelineBoardStateOf('flow-human-code-review-live').pipeline;
    if (approving?.readingVerdict !== 'readable') throw new Error('the fixture has no readable pipeline');
    const notApproving = { ...approving, pipeline: { ...approving.pipeline, approvals: { tickets: true, merge: false } } };
    expect([
      MergeQueueModel.orderTextOf(approving),
      MergeQueueModel.orderTextOf(notApproving),
      MergeQueueModel.orderTextOf({ readingVerdict: 'absent' }),
      MergeQueueModel.orderTextOf(undefined),
    ]).toEqual([
      'Ordered by User\'s Merge presses, earliest first, then ticket id.',
      'Ordered by priority, clean before conflicting, fewest conflicts caused, readiness, then ticket id.',
      'Ordered by priority, clean before conflicting, fewest conflicts caused, readiness, then ticket id.',
      'Ordered by priority, clean before conflicting, fewest conflicts caused, readiness, then ticket id.',
    ]);
  });
});
