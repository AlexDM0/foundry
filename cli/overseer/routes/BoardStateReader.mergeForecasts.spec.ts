/**
 * The merge forecasting a board read runs, counted through a planted predictor. What matters is that a publish over an unmoved tip set runs
 * no second prediction, that moving the target or any candidate predicts afresh, and that a candidate whose branch does not resolve, or a
 * prediction that failed, is never cached, so it is retried on the next read. The tips are the recorded answers of `src/testing/RecordedGit.ts`.
 */
import { afterAll, expect, test } from 'bun:test';


import type { MergePrediction, predictMerges }                    from '../../../src/lib/git/MergeTree.ts';
import { GIT_CALL_SHAPES, RECORDED_PLACEHOLDERS, useRecordedGit } from '../../../src/testing/RecordedGit.ts';
import type { RecordedGitStep }                                   from '../../../src/testing/RecordedGit.ts';
import { createScratchDirectory, removeScratchDirectory }         from '../../../src/testing/ScratchWorkspace.ts';
import { describeWhenGitIsRecorded }                              from '../../../src/testing/ToolGuard.ts';
import { createMergeForecastCache, mergeForecastingIn }           from './BoardStateReader.ts';

const recordedGit = useRecordedGit();

const MAIN_LINE = 'master';
const MAIN_TIP = 'a'.repeat(40);
const MOVED_MAIN_TIP = 'b'.repeat(40);
const FIRST_TICKET_TIP = 'c'.repeat(40);
const SECOND_TICKET_TIP = 'd'.repeat(40);
const MOVED_SECOND_TICKET_TIP = 'e'.repeat(40);

const repositoryDirectory = createScratchDirectory('merge-forecast-cache');
afterAll(() => removeScratchDirectory(repositoryDirectory));

/** The tips of the main line, `ticket-1` and `ticket-2`, all resolving. */
function tipsOf(mainTip: string, secondTicketTip: string): RecordedGitStep {
  return {
    gitArguments: ['rev-parse', '--end-of-options', MAIN_LINE, 'ticket-1', 'ticket-2'],
    answeredAs:   GIT_CALL_SHAPES.TIPS_ALL_RESOLVING,
    filledIn:     { [RECORDED_PLACEHOLDERS.COMMIT]: mainTip, [RECORDED_PLACEHOLDERS.FIRST_TIP]: FIRST_TICKET_TIP, [RECORDED_PLACEHOLDERS.SECOND_TIP]: secondTicketTip },
  };
}

const TIPS_WITH_A_MISSING_BRANCH: RecordedGitStep = {
  gitArguments: ['rev-parse', '--end-of-options', MAIN_LINE, 'ticket-1', 'ticket-3'],
  answeredAs:   GIT_CALL_SHAPES.TIPS_LAST_NOT_RESOLVING,
  filledIn:     { [RECORDED_PLACEHOLDERS.COMMIT]: MAIN_TIP, [RECORDED_PLACEHOLDERS.FIRST_TIP]: FIRST_TICKET_TIP },
};

interface CountingPredictor {
  predict:         typeof predictMerges;
  runCount:        () => number;
  /** From now on, the branch `branch` conflicts with any target. */
  plantConflictOf: (branch: string) => void;
}

/** Each pair is clean unless planted otherwise, and a branch no tip set holds fails its prediction, as a branch that does not resolve does. */
function countingPredictor(): CountingPredictor {
  let runs = 0;
  const conflictingBranches = new Set<string>();
  const predictionOf = (branch: string): MergePrediction => {
    if (branch === 'ticket-3') return { verdict: 'prediction-failed', reason: 'the branch does not resolve' };
    return conflictingBranches.has(branch) ? { verdict: 'conflicting', conflictedFiles: ['shared.txt'] } : { verdict: 'clean' };
  };
  return {
    predict: (_directory, pairs) => {
      runs += 1;
      return pairs.map(({ branch }) => predictionOf(branch));
    },
    runCount:        () => runs,
    plantConflictOf: (branch) => conflictingBranches.add(branch),
  };
}

describeWhenGitIsRecorded('caching the merge forecasts across board reads', () => {
  test('a second read over an unchanged tip set runs no prediction and returns the same forecasts', async () => {
    const predictor   = countingPredictor();
    const forecasting = mergeForecastingIn(repositoryDirectory, MAIN_LINE, createMergeForecastCache(), predictor.predict);
    await recordedGit.playStage([tipsOf(MAIN_TIP, SECOND_TICKET_TIP), tipsOf(MAIN_TIP, SECOND_TICKET_TIP)], async () => {
      const first = forecasting.forecastsOf(MAIN_LINE, ['1', '2']);
      const runsAfterFirstRead = predictor.runCount();
      expect(runsAfterFirstRead).toBeGreaterThan(0);
      expect(forecasting.forecastsOf(MAIN_LINE, ['1', '2'])).toBe(first);
      expect(predictor.runCount()).toBe(runsAfterFirstRead);
    });
  });

  test('a moved candidate branch or a moved target predicts afresh', async () => {
    const predictor   = countingPredictor();
    const forecasting = mergeForecastingIn(repositoryDirectory, MAIN_LINE, createMergeForecastCache(), predictor.predict);
    const stage = [tipsOf(MAIN_TIP, SECOND_TICKET_TIP), tipsOf(MAIN_TIP, MOVED_SECOND_TICKET_TIP), tipsOf(MOVED_MAIN_TIP, MOVED_SECOND_TICKET_TIP)];
    await recordedGit.playStage(stage, async () => {
      forecasting.forecastsOf(MAIN_LINE, ['1', '2']);
      const runsPerRead = predictor.runCount();
      forecasting.forecastsOf(MAIN_LINE, ['1', '2']);
      expect(predictor.runCount()).toBe(runsPerRead * 2);
      predictor.plantConflictOf('ticket-2');
      expect(forecasting.forecastsOf(MAIN_LINE, ['1', '2']).againstTarget['2']?.forecast).toBe('conflicting');
      expect(predictor.runCount()).toBeGreaterThan(runsPerRead * 2);
    });
  });

  test('a queue holding a branch that does not resolve is never cached', async () => {
    const predictor   = countingPredictor();
    const forecasting = mergeForecastingIn(repositoryDirectory, MAIN_LINE, createMergeForecastCache(), predictor.predict);
    await recordedGit.playStage([TIPS_WITH_A_MISSING_BRANCH, TIPS_WITH_A_MISSING_BRANCH], async () => {
      expect(forecasting.forecastsOf(MAIN_LINE, ['1', '3']).againstTarget['3']?.forecast).toBe('prediction-failed');
      const runsAfterFirstRead = predictor.runCount();
      forecasting.forecastsOf(MAIN_LINE, ['1', '3']);
      expect(predictor.runCount()).toBe(runsAfterFirstRead * 2);
    });
  });

  test('a prediction that failed over a resolvable tip set is never cached, so the next read retries it', async () => {
    let failNextRun = true;
    const predictor = countingPredictor();
    const failingOncePredictor: typeof predictMerges = (directory, pairs) => {
      if (!failNextRun) return predictor.predict(directory, pairs);
      failNextRun = false;
      return pairs.map(() => ({ verdict: 'prediction-failed' as const, reason: 'planted failure' }));
    };
    const forecasting = mergeForecastingIn(repositoryDirectory, MAIN_LINE, createMergeForecastCache(), failingOncePredictor);
    await recordedGit.playStage([tipsOf(MAIN_TIP, SECOND_TICKET_TIP), tipsOf(MAIN_TIP, SECOND_TICKET_TIP)], async () => {
      expect(forecasting.forecastsOf(MAIN_LINE, ['1', '2']).againstTarget['1']?.forecast).toBe('prediction-failed');
      expect(forecasting.forecastsOf(MAIN_LINE, ['1', '2']).againstTarget['1']?.forecast).toBe('clean');
    });
  });

  test('without a cache every read predicts afresh, asking git for no tips', async () => {
    const predictor   = countingPredictor();
    const forecasting = mergeForecastingIn(repositoryDirectory, MAIN_LINE, null, predictor.predict);
    await recordedGit.playStage([], async () => {
      forecasting.forecastsOf(MAIN_LINE, ['1', '2']);
      const runsAfterFirstRead = predictor.runCount();
      forecasting.forecastsOf(MAIN_LINE, ['1', '2']);
      expect(predictor.runCount()).toBe(runsAfterFirstRead * 2);
    });
  });
});
