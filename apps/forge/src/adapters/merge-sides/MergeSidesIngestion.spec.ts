/**
 * A merge's two tips both ways, one format for the merge before review and each round of `merging-main`. What matters: what the writer
 * stores reads back as the same tips; a missing file is absent, since a worktree that holds the target's tip merges nothing; and a file
 * that is not JSON, of another version or none, or with a tip that is not text is unreadable, never a merge that has yet to start, and
 * never a throw.
 */
import { writeFileSync } from 'node:fs';
import { join }          from 'node:path';
import {
  afterEach,
  beforeEach,
  expect,
  test
} from 'bun:test';

import { createScratchDirectory, removeScratchDirectory }                   from '../../testing/ScratchWorkspace.ts';
import { MERGE_SIDES_FORMAT_VERSION, type MergeSides, MergeSidesIngestion } from './MergeSidesIngestion.ts';
import { createMergeSidesWriter }                                           from './MergeSidesWriter.ts';

let scratchDirectory = '';

const sidesFilePath = (): string => join(scratchDirectory, 'main-merge-2.json');

const reading = (): ReturnType<MergeSidesIngestion['read']> => new MergeSidesIngestion(sidesFilePath()).read();

const SIDES: MergeSides = { startTip: 'branch-tip', mergedTip: 'target-tip' };

beforeEach(() => {
  scratchDirectory = createScratchDirectory('merge-sides-ingestion');
});

afterEach(() => {
  removeScratchDirectory(scratchDirectory);
});

test('no file is absent', () => {
  expect(reading()).toEqual({ verdict: 'absent' });
});

test('what the writer stores reads back as the same tips, with its version', () => {
  createMergeSidesWriter(sidesFilePath()).write(SIDES);
  expect(reading()).toEqual({ verdict: 'readable', sides: SIDES });
});

test('a file that is not JSON is unreadable', () => {
  writeFileSync(sidesFilePath(), '{"startTip": ');
  expect(reading()).toMatchObject({ verdict: 'unreadable' });
});

test('tips of another version, or of none, are unreadable', () => {
  writeFileSync(sidesFilePath(), `${JSON.stringify({ ...SIDES, version: MERGE_SIDES_FORMAT_VERSION + 1 })}\n`);
  expect(reading()).toEqual({ verdict: 'unreadable', reason: `its version is not ${MERGE_SIDES_FORMAT_VERSION}` });
  writeFileSync(sidesFilePath(), `${JSON.stringify(SIDES)}\n`);
  expect(reading()).toEqual({ verdict: 'unreadable', reason: `its version is not ${MERGE_SIDES_FORMAT_VERSION}` });
});

test.each([
  ['startTip', { startTip: null }, 'its "startTip" is not a commit'],
  ['mergedTip', { mergedTip: undefined }, 'its "mergedTip" is not a commit'],
])('a wrong %s is unreadable', (_field, change, reason) => {
  writeFileSync(sidesFilePath(), `${JSON.stringify({ version: MERGE_SIDES_FORMAT_VERSION, ...SIDES, ...change })}\n`);
  expect(reading()).toEqual({ verdict: 'unreadable', reason });
});

test('a folder where the file belongs is unreadable, not absent, and does not throw', () => {
  const ingestion = new MergeSidesIngestion(scratchDirectory);
  expect(() => ingestion.read()).not.toThrow();
  expect(ingestion.read()).toMatchObject({ verdict: 'unreadable' });
});
