/**
 * The cache mark. What matters: a full hit reads "cached" and a partial one "partly cached", while a miss and no report have no mark and
 * leave the text alone; and a gate's report is its newest run's in that phase, never a run of another gate or phase.
 */
import { describe, expect, test } from 'bun:test';

import type { GateProfileRunFacts } from '../../../../src/lib/tracker-model/@types/PipelineFacts.ts';
import { GateCacheMarkModel }       from './GateCacheMarkModel.ts';

function profileRun(gateName: string, phase: GateProfileRunFacts['phase'], cacheReport: GateProfileRunFacts['cacheReport']): GateProfileRunFacts {
  return {
    profileRunId: 'P1', gateName, phase, state: 'passed', elapsedMilliseconds: 400, cacheReport,
  };
}

describe('the cache mark', () => {
  test('words a full hit and a partial one, and has no word for a miss or no report', () => {
    expect((['hit', 'partial', 'miss', null] as const).map(GateCacheMarkModel.cacheWordOf)).toEqual(['cached', 'partly cached', null, null]);
  });

  test('stands beside the text it marks, and leaves a text with no mark alone', () => {
    expect([GateCacheMarkModel.withCacheWordOf('41 s', 'hit'), GateCacheMarkModel.withCacheWordOf('41 s', 'miss')]).toEqual(['41 s · cached', '41 s']);
  });

  test('takes a gate\'s report from its own run in the phase, never another gate\'s or another phase\'s', () => {
    const runs = [profileRun('lint', 'build', 'hit'), profileRun('tests', 'merge', 'partial')];
    expect([
      GateCacheMarkModel.gateCacheReportOf(runs, 'lint', 'build'),
      GateCacheMarkModel.gateCacheReportOf(runs, 'tests', 'build'),
      GateCacheMarkModel.gateCacheReportOf(runs, 'lint', 'merge'),
    ]).toEqual(['hit', null, null]);
  });
});
