/**
 * The gate's cache report from a turbo run. What matters: every task with a script replayed is a hit, some a partial hit and none a miss,
 * while a task with no script counts for neither and a run of only such tasks reports nothing; the report is the version 1 form forge
 * reads; and it is written only where forge handed a path, never failing the gate on a path it cannot write.
 */
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync
} from 'node:fs';
import { join } from 'node:path';
import {
  afterAll,
  beforeAll,
  describe,
  expect,
  test
} from 'bun:test';

import { cacheReportOf, gateReportTextOf, writeGateReport } from './GateCacheReport.ts';
import type { SummarizedTask }                              from './TurboRunSummary.ts';

const SCRATCH_ROOT = join(import.meta.dir, '.scratch');

function taskOf(taskId: string, cacheStatus: string, command = 'bun test'): SummarizedTask {
  return {
    taskId, hash: '1111111111111111', command, cache: { status: cacheStatus },
  };
}

const NO_SCRIPT = taskOf('example#lint', 'MISS', '<NONEXISTENT>');

describe('the cache report of a run', () => {
  test('is a hit when every task with a script replayed, partial when some did and a miss when none did, a task with no script aside', () => {
    expect([
      cacheReportOf([taskOf('example#test', 'HIT'), taskOf('other#test', 'HIT'), NO_SCRIPT]),
      cacheReportOf([taskOf('example#test', 'HIT'), taskOf('other#test', 'MISS'), NO_SCRIPT]),
      cacheReportOf([taskOf('example#test', 'MISS'), NO_SCRIPT]),
    ]).toEqual(['hit', 'partial', 'miss']);
  });

  test('is nothing for a run with no task that has a script', () => {
    expect([cacheReportOf([]), cacheReportOf([NO_SCRIPT])]).toEqual([null, null]);
  });

  test('is written in the version 1 form forge reads', () => {
    expect(JSON.parse(gateReportTextOf('partial'))).toEqual({ version: 1, cache: 'partial' });
  });
});

describe('the written report', () => {
  let scratchFolder = '';

  beforeAll(() => {
    mkdirSync(SCRATCH_ROOT, { recursive: true });
    scratchFolder = mkdtempSync(join(SCRATCH_ROOT, 'gate-cache-report-'));
  });

  afterAll(() => {
    rmSync(scratchFolder, { recursive: true, force: true });
  });

  test('lands at the path forge handed', () => {
    const reportPath = join(scratchFolder, 'report.json');
    writeGateReport(reportPath, [taskOf('example#test', 'HIT')]);
    expect(readFileSync(reportPath, 'utf8')).toBe(gateReportTextOf('hit'));
  });

  test('is not written without a path, without a summary, or for a run with nothing to report', () => {
    const reportPath = join(scratchFolder, 'unwritten.json');
    writeGateReport(undefined, [taskOf('example#test', 'HIT')]);
    writeGateReport(reportPath, undefined);
    writeGateReport(reportPath, [NO_SCRIPT]);
    expect(existsSync(reportPath)).toBe(false);
  });

  test('at a path that cannot be written is left unwritten, and the gate goes on', () => {
    const reportPath = join(scratchFolder, 'no-such-folder', 'report.json');
    expect(() => writeGateReport(reportPath, [taskOf('example#test', 'HIT')])).not.toThrow();
    expect(existsSync(reportPath)).toBe(false);
  });
});
