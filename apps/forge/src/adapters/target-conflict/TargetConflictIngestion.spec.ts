/**
 * A review's catch-up conflict both ways. What matters: what the writer stores reads back as the same conflict; a missing file is absent;
 * and a file that is not JSON, of another version or none, or with the tip or the conflicted files of the wrong shape is unreadable, never
 * a builder told nothing of the conflict, and never a throw.
 */
import { writeFileSync } from 'node:fs';
import { join }          from 'node:path';
import {
  afterEach,
  beforeEach,
  expect,
  test
} from 'bun:test';

import { createScratchDirectory, removeScratchDirectory }                               from '../../testing/ScratchWorkspace.ts';
import type { TargetConflictProblem }                                                   from './@types/TargetConflictProblem.ts';
import { TARGET_CONFLICT_FORMAT_VERSION, type TargetConflict, TargetConflictIngestion } from './TargetConflictIngestion.ts';
import { createTargetConflictWriter }                                                   from './TargetConflictWriter.ts';

let scratchDirectory = '';

const conflictFilePath = (): string => join(scratchDirectory, 'target-conflict.json');

const reading = (): ReturnType<TargetConflictIngestion['read']> => new TargetConflictIngestion(conflictFilePath()).read();

const CONFLICT: TargetConflict = { targetTip: 'target-tip', conflictedFiles: ['shared.txt'] };

beforeEach(() => {
  scratchDirectory = createScratchDirectory('target-conflict-ingestion');
});

afterEach(() => {
  removeScratchDirectory(scratchDirectory);
});

test('no file is absent', () => {
  expect(reading()).toEqual({ verdict: 'absent' });
});

test('what the writer stores reads back as the same conflict, with its version', () => {
  createTargetConflictWriter(conflictFilePath()).write(CONFLICT);
  expect(reading()).toEqual({ verdict: 'readable', conflict: CONFLICT });
});

test('a file that is not JSON is unreadable', () => {
  writeFileSync(conflictFilePath(), '{"targetTip": ');
  expect(reading()).toMatchObject({ verdict: 'unreadable' });
});

test('a conflict of another version, or of none, is unreadable', () => {
  writeFileSync(conflictFilePath(), `${JSON.stringify({ ...CONFLICT, version: TARGET_CONFLICT_FORMAT_VERSION + 1 })}\n`);
  expect(reading()).toEqual({ verdict: 'unreadable', problem: { code: 'version-differs', field: 'version', expectedVersion: TARGET_CONFLICT_FORMAT_VERSION } });
  writeFileSync(conflictFilePath(), `${JSON.stringify(CONFLICT)}\n`);
  expect(reading()).toEqual({ verdict: 'unreadable', problem: { code: 'version-differs', field: 'version', expectedVersion: TARGET_CONFLICT_FORMAT_VERSION } });
});

test.each<[string, Record<string, unknown>, TargetConflictProblem]>([
  ['targetTip', { targetTip: false }, { code: 'field-is-not', field: 'targetTip', expected: 'a-commit' }],
  ['conflictedFiles', { conflictedFiles: null }, { code: 'field-is-not', field: 'conflictedFiles', expected: 'a-list-of-paths' }],
])('a wrong %s is unreadable', (_field, change, problem) => {
  writeFileSync(conflictFilePath(), `${JSON.stringify({ version: TARGET_CONFLICT_FORMAT_VERSION, ...CONFLICT, ...change })}\n`);
  expect(reading()).toEqual({ verdict: 'unreadable', problem });
});

test('a folder where the file belongs is unreadable, not absent, and does not throw', () => {
  const ingestion = new TargetConflictIngestion(scratchDirectory);
  expect(() => ingestion.read()).not.toThrow();
  expect(ingestion.read()).toMatchObject({ verdict: 'unreadable' });
});
