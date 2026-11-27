/**
 * A `merging-main` conflict's kept resolution both ways. What matters: what the writer stores reads back as the same resolution, its lines
 * `null` when git could not measure them; a missing file is absent, since the first look measures and keeps it; and a file that is not
 * JSON, of another version or none, or with any field of the wrong shape is unreadable, never one to measure again against a later HEAD,
 * and never a throw.
 */
import { writeFileSync } from 'node:fs';
import { join }          from 'node:path';
import {
  afterEach,
  beforeEach,
  expect,
  test
} from 'bun:test';

import { createScratchDirectory, removeScratchDirectory }                                               from '../../testing/ScratchWorkspace.ts';
import type { MainMergeResolutionProblem }                                                              from './@types/MainMergeResolutionProblem.ts';
import { MAIN_MERGE_RESOLUTION_FORMAT_VERSION, type MainMergeResolution, MainMergeResolutionIngestion } from './MainMergeResolutionIngestion.ts';
import { createMainMergeResolutionWriter }                                                              from './MainMergeResolutionWriter.ts';

let scratchDirectory = '';

const resolutionFilePath = (): string => join(scratchDirectory, 'main-resolution.json');

const reading = (): ReturnType<MainMergeResolutionIngestion['read']> => new MainMergeResolutionIngestion(resolutionFilePath()).read();

const RESOLUTION: MainMergeResolution = {
  conflictRound: 1, targetTip: 'target-tip', branchTip: 'branch-tip', conflictedFiles: ['shared.txt'], resolutionCommit: 'resolution-commit', lines: 12
};

beforeEach(() => {
  scratchDirectory = createScratchDirectory('main-merge-resolution-ingestion');
});

afterEach(() => {
  removeScratchDirectory(scratchDirectory);
});

test('no file is absent', () => {
  expect(reading()).toEqual({ verdict: 'absent' });
});

test.each<[string, MainMergeResolution]>([
  ['measured lines', RESOLUTION],
  ['lines git could not measure', { ...RESOLUTION, conflictRound: 2, lines: null }],
])('what the writer stores reads back as the same resolution, with %s', (_lines, resolution) => {
  createMainMergeResolutionWriter(resolutionFilePath()).write(resolution);
  expect(reading()).toEqual({ verdict: 'readable', resolution });
});

test('a file that is not JSON is unreadable', () => {
  writeFileSync(resolutionFilePath(), '{"conflictRound": ');
  expect(reading()).toMatchObject({ verdict: 'unreadable' });
});

test('a resolution of another version, or of none, is unreadable', () => {
  writeFileSync(resolutionFilePath(), `${JSON.stringify({ ...RESOLUTION, version: MAIN_MERGE_RESOLUTION_FORMAT_VERSION + 1 })}\n`);
  expect(reading()).toEqual({ verdict: 'unreadable', problem: { code: 'version-differs', field: 'version', expectedVersion: MAIN_MERGE_RESOLUTION_FORMAT_VERSION } });
  writeFileSync(resolutionFilePath(), `${JSON.stringify(RESOLUTION)}\n`);
  expect(reading()).toEqual({ verdict: 'unreadable', problem: { code: 'version-differs', field: 'version', expectedVersion: MAIN_MERGE_RESOLUTION_FORMAT_VERSION } });
});

test.each<[string, Record<string, unknown>, MainMergeResolutionProblem]>([
  ['conflictRound', { conflictRound: 0 }, { code: 'field-is-not', field: 'conflictRound', expected: 'a-round' }],
  ['targetTip', { targetTip: 1 }, { code: 'field-is-not', field: 'targetTip', expected: 'a-commit' }],
  ['branchTip', { branchTip: [] }, { code: 'field-is-not', field: 'branchTip', expected: 'a-commit' }],
  ['conflictedFiles', { conflictedFiles: 'shared.txt' }, { code: 'field-is-not', field: 'conflictedFiles', expected: 'a-list-of-paths' }],
  ['resolutionCommit', { resolutionCommit: null }, { code: 'field-is-not', field: 'resolutionCommit', expected: 'a-commit' }],
  ['lines', { lines: '12' }, { code: 'field-is-not', field: 'lines', expected: 'a-line-count-or-null' }],
])('a wrong %s is unreadable', (_field, change, problem) => {
  writeFileSync(resolutionFilePath(), `${JSON.stringify({ version: MAIN_MERGE_RESOLUTION_FORMAT_VERSION, ...RESOLUTION, ...change })}\n`);
  expect(reading()).toEqual({ verdict: 'unreadable', problem });
});

test('a folder where the file belongs is unreadable, not absent, and does not throw', () => {
  const ingestion = new MainMergeResolutionIngestion(scratchDirectory);
  expect(() => ingestion.read()).not.toThrow();
  expect(ingestion.read()).toMatchObject({ verdict: 'unreadable' });
});
