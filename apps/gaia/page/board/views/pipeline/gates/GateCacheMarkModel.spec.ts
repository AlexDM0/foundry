/**
 * The cache mark. What matters: a full hit reads "cached" and a partial one "partly cached", while a miss and no report have no mark and
 * leave the text alone; and a gate's report is its own mark in that phase, never the mark of another gate or phase.
 */
import { describe, expect, test }          from 'bun:test';
import type { BoardGateCacheMarkDocument } from '../../../../@types/board/BoardPipelineDocuments.ts';

import { GateCacheMarkModel } from './GateCacheMarkModel.ts';

describe('the cache mark', () => {
  test('words a full hit and a partial one, and has no word for a miss or no report', () => {
    expect((['hit', 'partial', 'miss', null] as const).map(GateCacheMarkModel.cacheWordOf)).toEqual(['cached', 'partly cached', null, null]);
  });

  test('stands beside the text it marks, and leaves a text with no mark alone', () => {
    expect([GateCacheMarkModel.withCacheWordOf('41 s', 'hit'), GateCacheMarkModel.withCacheWordOf('41 s', 'miss')]).toEqual(['41 s · cached', '41 s']);
  });

  test('takes a gate\'s report from its own mark in the phase, never another gate\'s or another phase\'s', () => {
    const marks: BoardGateCacheMarkDocument[] = [{
      entity: null, gateName: 'lint', phase: 'build', cacheReport: 'hit'
    }, {
      entity: null, gateName: 'tests', phase: 'merge', cacheReport: 'partial'
    }];
    expect([
      GateCacheMarkModel.gateCacheReportOf(marks, 'lint', 'build'),
      GateCacheMarkModel.gateCacheReportOf(marks, 'tests', 'build'),
      GateCacheMarkModel.gateCacheReportOf(marks, 'lint', 'merge'),
    ]).toEqual(['hit', null, null]);
  });
});
