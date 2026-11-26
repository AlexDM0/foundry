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
  expect(reading()).toEqual({ verdict: 'unreadable', reason: `its version is not ${MAIN_MERGE_CONFLICT_FORMAT_VERSION}` });
  writeFileSync(conflictFilePath(), `${JSON.stringify(CONFLICT)}\n`);
  expect(reading()).toEqual({ verdict: 'unreadable', reason: `its version is not ${MAIN_MERGE_CONFLICT_FORMAT_VERSION}` });
});

test.each([
  ['targetTip', { targetTip: 1 }, 'its "targetTip" is not a commit'],
  ['branchTip', { branchTip: null }, 'its "branchTip" is not a commit'],
  ['conflictedFiles', { conflictedFiles: [1] }, 'its "conflictedFiles" is not a list of paths'],
])('a wrong %s is unreadable', (_field, change, reason) => {
  writeFileSync(conflictFilePath(), `${JSON.stringify({ version: MAIN_MERGE_CONFLICT_FORMAT_VERSION, ...CONFLICT, ...change })}\n`);
  expect(reading()).toEqual({ verdict: 'unreadable', reason });
});

test('a folder where the file belongs is unreadable, not absent, and does not throw', () => {
  const ingestion = new MainMergeConflictIngestion(scratchDirectory);
  expect(() => ingestion.read()).not.toThrow();
  expect(ingestion.read()).toMatchObject({ verdict: 'unreadable' });
});
