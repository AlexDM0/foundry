/**
 * A job's gate run in the log. What matters: a tracker whose gates never reported logs exactly the record it logged before, with no
 * cache reports; once a gate reported, its run keeps every gate's report with the run's phase, and every later run keeps its gates' too,
 * a gate that reported nothing included, so a run that reported nothing clears the mark of the run before it.
 */
import { expect, test } from 'bun:test';

import { boardFixture }             from '../../testing/BoardFixtures.ts';
import type { GateRunCacheReports } from './@types/Job.ts';

const AT = '2026-11-16T10:00:00+01:00';
const TREE = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';

function reportsOf(verify: GateRunCacheReports['gates'][number]['cacheReport']): GateRunCacheReports {
  return { phase: 'build', gates: [{ gateName: 'verify', cacheReport: verify }, { gateName: 'lint', cacheReport: null }] };
}

test('a run whose gates reported nothing, on a tracker none of whose gates ever did, logs no cache reports', () => {
  const { board, records } = boardFixture();

  board.recordGateRan({
    tree: TREE, outcome: 'passed', cached: false, cacheReports: reportsOf(null)
  }, AT);

  expect(records.map((record) => record.fields)).toEqual([{ tree: TREE, outcome: 'passed', cached: false }]);
});

test('a run whose gate reported keeps every gate\'s report, and every later run keeps its gates\' too, a run that reported nothing included', () => {
  const { board, records } = boardFixture();

  board.recordGateRan({
    tree: TREE, outcome: 'passed', cached: false, cacheReports: reportsOf('hit')
  }, AT);
  board.recordGateRan({
    tree: TREE, outcome: 'failed', cached: false, cacheReports: reportsOf(null)
  }, AT);
  board.recordGateRan({ tree: TREE, outcome: 'passed', cached: false }, AT);

  expect(records.map((record) => record.fields)).toEqual([
    {
      tree: TREE, outcome: 'passed', cached: false, cacheReports: reportsOf('hit')
    },
    {
      tree: TREE, outcome: 'failed', cached: false, cacheReports: reportsOf(null)
    },
    { tree: TREE, outcome: 'passed', cached: false },
  ]);
});
