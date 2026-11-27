/**
 * A `merging-main` round's conflict both ways. What matters: what the writer stores reads back as the same conflict; a missing file is
 * absent, since most rounds never conflict; and a file that is not JSON, of another version or none, or with a tip or the conflicted files
 * of the wrong shape is unreadable, never a round that did not conflict, and never a throw.
 */
import { writeFileSync } from 'node:fs';
import { join }          from 'node:path';
import {
  afterEach,
  beforeEach,
  expect,
  test
} from 'bun:test';

import { createScratchDirectory, removeScratchDirectory }                                         from '../../testing/ScratchWorkspace.ts';
import type { MainMergeConflictProblem }                                                          from './@types/MainMergeConflictProblem.ts';
import { MAIN_MERGE_CONFLICT_FORMAT_VERSION, type MainMergeConflict, MainMergeConflictIngestion } from './MainMergeConflictIngestion.ts';
import { createMainMergeConflictWriter }                                                          from './MainMergeConflictWriter.ts';

let scratchDirectory = '';

const conflictFilePath = (): string => join(scratchDirectory, 'main-conflict.json');

const reading = (): ReturnType<MainMergeConflictIngestion['read']> => new MainMergeConflictIngestion(conflictFilePath()).read();

const CONFLICT: MainMergeConflict = { targetTip: 'target-tip', branchTip: 'branch-tip', conflictedFiles: ['shared.txt'] };

beforeEach(() => {
  scratchDirectory = createScratchDirectory('main-merge-conflict-ingestion');
});

afterEach(() => {
  removeScratchDirectory(scratchDirectory);
});

test('no file is absent', () => {
  expect(reading()).toEqual({ verdict: 'absent' });
});

test('what the writer stores reads back as the same conflict, with its version', () => {
  createMainMergeConflictWriter(conflictFilePath()).write(CONFLICT);
  expect(reading()).toEqual({ verdict: 'readable', conflict: CONFLICT });
});

test('a file that is not JSON is unreadable', () => {
  writeFileSync(conflictFilePath(), '{"targetTip": ');
  expect(reading()).toMatchObject({ verdict: 'unreadable' });
});

test('a conflict of another version, or of none, is unreadable', () => {
  writeFileSync(conflictFilePath(), `${JSON.stringify({ ...CONFLICT, version: MAIN_MERGE_CONFLICT_FORMAT_VERSION + 1 })}\n`);
  expect(reading()).toEqual({ verdict: 'unreadable', problem: { code: 'version-differs', field: 'version', expectedVersion: MAIN_MERGE_CONFLICT_FORMAT_VERSION } });
  writeFileSync(conflictFilePath(), `${JSON.stringify(CONFLICT)}\n`);
  expect(reading()).toEqual({ verdict: 'unreadable', problem: { code: 'version-differs', field: 'version', expectedVersion: MAIN_MERGE_CONFLICT_FORMAT_VERSION } });
});

test.each<[string, Record<string, unknown>, MainMergeConflictProblem]>([
  ['targetTip', { targetTip: 1 }, { code: 'field-is-not', field: 'targetTip', expected: 'a-commit' }],
  ['branchTip', { branchTip: null }, { code: 'field-is-not', field: 'branchTip', expected: 'a-commit' }],
  ['conflictedFiles', { conflictedFiles: [1] }, { code: 'field-is-not', field: 'conflictedFiles', expected: 'a-list-of-paths' }],
])('a wrong %s is unreadable', (_field, change, problem) => {
  writeFileSync(conflictFilePath(), `${JSON.stringify({ version: MAIN_MERGE_CONFLICT_FORMAT_VERSION, ...CONFLICT, ...change })}\n`);
  expect(reading()).toEqual({ verdict: 'unreadable', problem });
});

test('a folder where the file belongs is unreadable, not absent, and does not throw', () => {
  const ingestion = new MainMergeConflictIngestion(scratchDirectory);
  expect(() => ingestion.read()).not.toThrow();
  expect(ingestion.read()).toMatchObject({ verdict: 'unreadable' });
});
