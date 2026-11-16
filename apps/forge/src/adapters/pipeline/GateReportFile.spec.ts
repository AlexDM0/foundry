/**
 * A gate's report file. What matters: each of the three cache words of version 1 reads as itself, a key the version does not name is
 * passed over; and everything else fails closed to no report, never a throw: no file, text that is no JSON or no object, another version,
 * a cache word outside the three, a file over the size limit, and a link the gate left at the path, whatever it points to.
 */
import { symlinkSync, writeFileSync } from 'node:fs';
import { join }                       from 'node:path';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  test,
} from 'bun:test';

import { createScratchDirectory, removeScratchDirectory } from '../../testing/ScratchWorkspace.ts';
import { GATE_REPORT_SIZE_LIMIT_BYTES, GateReportFile }   from './GateReportFile.ts';

describe('the report text', () => {
  test('reads each cache word of version 1 as itself', () => {
    expect(['hit', 'partial', 'miss'].map((cache) => GateReportFile.cacheReportOf(JSON.stringify({ version: 1, cache })))).toEqual(['hit', 'partial', 'miss']);
  });

  test('passes over a key version 1 does not name', () => {
    expect(GateReportFile.cacheReportOf(JSON.stringify({ version: 1, cache: 'hit', tasks: 12 }))).toBe('hit');
  });

  test('reads no report from text that is no JSON object, another version, or a cache word outside the three', () => {
    const texts = [
      '',
      'hit',
      '["hit"]',
      JSON.stringify({ cache: 'hit' }),
      JSON.stringify({ version: 2, cache: 'hit' }),
      JSON.stringify({ version: '1', cache: 'hit' }),
      JSON.stringify({ version: 1, cache: 'HIT' }),
      JSON.stringify({ version: 1 }),
    ];
    expect(texts.map(GateReportFile.cacheReportOf)).toEqual(texts.map(() => null));
  });
});

describe('the report file', () => {
  let scratchFolder = '';

  beforeEach(() => {
    scratchFolder = createScratchDirectory('gate-report-file');
  });

  afterEach(() => {
    removeScratchDirectory(scratchFolder);
  });

  test('reads the report a gate wrote', () => {
    const reportPath = join(scratchFolder, 'report.json');
    writeFileSync(reportPath, JSON.stringify({ version: 1, cache: 'partial' }));
    expect(GateReportFile.read(reportPath)).toBe('partial');
  });

  test('reads no report where the gate wrote none', () => {
    expect(GateReportFile.read(join(scratchFolder, 'report.json'))).toBeNull();
  });

  test('reads no report from a file over the size limit, however it starts', () => {
    const reportPath = join(scratchFolder, 'report.json');
    const padded = JSON.stringify({ version: 1, cache: 'hit', padding: 'x'.repeat(GATE_REPORT_SIZE_LIMIT_BYTES) });
    writeFileSync(reportPath, padded);
    expect(GateReportFile.read(reportPath)).toBeNull();
  });

  test('reads no report through a link at the path, even to a valid report', () => {
    const targetPath = join(scratchFolder, 'elsewhere.json');
    const reportPath = join(scratchFolder, 'report.json');
    writeFileSync(targetPath, JSON.stringify({ version: 1, cache: 'hit' }));
    symlinkSync(targetPath, reportPath);
    expect(GateReportFile.read(reportPath)).toBeNull();
  });
});
