/**
 * The merge forecasting a board read runs, counted through a predictor wrapping the fake git's merge-tree. What matters is that a publish
 * over an unmoved tip set runs no second merge-tree, that moving the target or any candidate predicts afresh, and that a candidate whose
 * branch does not resolve, or a prediction that failed, is never cached, so it is retried on the next read.
 */
import { join } from 'node:path';

import {
  afterAll,
  describe,
  expect,
  test
} from 'bun:test';

import { predictMerge, type predictMerges }             from '../../../src/lib/git/MergeTree.ts';
import { fakeGitRun, useFakeGit }                       from '../../../src/testing/FakeGit.ts';
import { removeScratchDirectory }                       from '../../../src/testing/ScratchWorkspace.ts';
import { createMergeForecastCache, mergeForecastingIn } from './BoardStateReader.ts';

const fakeGit = useFakeGit();

const scratchDirectories: string[] = [];
afterAll(() => {
  for (const scratchDirectory of scratchDirectories) removeScratchDirectory(scratchDirectory);
});

interface PlantedQueue {
  repositoryDirectory: string;
  mainLine:            string;
  ticketWorktreeOf:    (ticketId: string) => string;
}

/** The main line holds `shared.txt`; `ticket-1` and `ticket-2` each add a file of their own, in a worktree of their own. */
function plantedQueueRepository(): PlantedQueue {
  const repositoryDirectory = fakeGit.createRepository('merge-forecast-cache');
  const worktreesDirectory = `${repositoryDirectory}-worktrees`;
  scratchDirectories.push(repositoryDirectory, worktreesDirectory);
  fakeGit.commitInSession(repositoryDirectory, 'shared.txt', 'first\n', 'Add the shared file');
  const mainLine = fakeGit.checkedOutBranchOf(repositoryDirectory);
  const ticketWorktreeOf = (ticketId: string): string => join(worktreesDirectory, `ticket-${ticketId}`);
  for (const ticketId of ['1', '2']) {
    fakeGitRun(repositoryDirectory, ['worktree', 'add', '-b', `ticket-${ticketId}`, ticketWorktreeOf(ticketId), mainLine]);
    fakeGit.commitInSession(ticketWorktreeOf(ticketId), `ticket-${ticketId}.txt`, `${ticketId}\n`, `Add ticket ${ticketId}`);
  }
  return { repositoryDirectory, mainLine, ticketWorktreeOf };
}

/** One single prediction for each pair, which the fake git answers, counted per predictor run. */
function countingPredictor(): { predict: typeof predictMerges; runCount: () => number } {
  let runs = 0;
  return {
    predict: (directory, pairs) => {
      runs += 1;
      return pairs.map((pair) => predictMerge(directory, pair));
    },
    runCount: () => runs,
  };
}

describe('caching the merge forecasts across board reads', () => {
  test('a second read over an unchanged tip set runs no merge-tree and returns the same forecasts', () => {
    const { repositoryDirectory, mainLine } = plantedQueueRepository();
    const predictor   = countingPredictor();
    const forecasting = mergeForecastingIn(repositoryDirectory, mainLine, createMergeForecastCache(), predictor.predict);
    const first       = forecasting.forecastsOf(mainLine, ['1', '2']);
    const runsAfterFirstRead = predictor.runCount();
    expect(runsAfterFirstRead).toBeGreaterThan(0);
    expect(forecasting.forecastsOf(mainLine, ['1', '2'])).toBe(first);
    expect(predictor.runCount()).toBe(runsAfterFirstRead);
  });

  test('a moved candidate branch or a moved target predicts afresh', () => {
    const { repositoryDirectory, mainLine, ticketWorktreeOf } = plantedQueueRepository();
    const predictor   = countingPredictor();
    const forecasting = mergeForecastingIn(repositoryDirectory, mainLine, createMergeForecastCache(), predictor.predict);
    forecasting.forecastsOf(mainLine, ['1', '2']);
    const runsPerRead = predictor.runCount();
    fakeGit.commitInSession(ticketWorktreeOf('2'), 'shared.txt', 'second\n', 'Change the shared file on ticket 2');
    forecasting.forecastsOf(mainLine, ['1', '2']);
    expect(predictor.runCount()).toBe(runsPerRead * 2);
    fakeGit.commitInSession(repositoryDirectory, 'shared.txt', 'main\n', 'Change the shared file on the main line');
    expect(forecasting.forecastsOf(mainLine, ['1', '2']).againstTarget['2']?.forecast).toBe('conflicting');
    expect(predictor.runCount()).toBeGreaterThan(runsPerRead * 2);
  });

  test('a queue holding a branch that does not resolve is never cached', () => {
    const { repositoryDirectory, mainLine } = plantedQueueRepository();
    const predictor   = countingPredictor();
    const forecasting = mergeForecastingIn(repositoryDirectory, mainLine, createMergeForecastCache(), predictor.predict);
    expect(forecasting.forecastsOf(mainLine, ['1', '3']).againstTarget['3']?.forecast).toBe('prediction-failed');
    const runsAfterFirstRead = predictor.runCount();
    forecasting.forecastsOf(mainLine, ['1', '3']);
    expect(predictor.runCount()).toBe(runsAfterFirstRead * 2);
  });

  test('a prediction that failed over a resolvable tip set is never cached, so the next read retries it', () => {
    const { repositoryDirectory, mainLine } = plantedQueueRepository();
    let failNextRun = true;
    const predictor = countingPredictor();
    const failingOncePredictor: typeof predictMerges = (directory, pairs) => {
      if (!failNextRun) return predictor.predict(directory, pairs);
      failNextRun = false;
      return pairs.map(() => ({ verdict: 'prediction-failed' as const, reason: 'planted failure' }));
    };
    const forecasting = mergeForecastingIn(repositoryDirectory, mainLine, createMergeForecastCache(), failingOncePredictor);
    expect(forecasting.forecastsOf(mainLine, ['1', '2']).againstTarget['1']?.forecast).toBe('prediction-failed');
    expect(forecasting.forecastsOf(mainLine, ['1', '2']).againstTarget['1']?.forecast).toBe('clean');
  });

  test('without a cache every read predicts afresh', () => {
    const { repositoryDirectory, mainLine } = plantedQueueRepository();
    const predictor   = countingPredictor();
    const forecasting = mergeForecastingIn(repositoryDirectory, mainLine, null, predictor.predict);
    forecasting.forecastsOf(mainLine, ['1', '2']);
    const runsAfterFirstRead = predictor.runCount();
    forecasting.forecastsOf(mainLine, ['1', '2']);
    expect(predictor.runCount()).toBe(runsAfterFirstRead * 2);
  });
});
