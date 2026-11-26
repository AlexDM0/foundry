/**
 * A merge's settlement both ways, one format for the merge before review and each round of `merging-main`. What matters: each of the three
 * settlements the writer stores reads back as itself; a missing file is absent, since a merge still running has none; and a file that is
 * not JSON, of another version or none, of another verdict or missing the verdict's own field is unreadable, never a merge still to
 * settle again, and never a throw.
 */
import { writeFileSync } from 'node:fs';
import { join }          from 'node:path';
import {
  afterEach,
  beforeEach,
  expect,
  test
} from 'bun:test';

import { createScratchDirectory, removeScratchDirectory }                                        from '../../testing/ScratchWorkspace.ts';
import { MERGE_SETTLEMENT_FORMAT_VERSION, MergeSettlementIngestion, type TargetMergeSettlement } from './MergeSettlementIngestion.ts';
import { createMergeSettlementWriter }                                                           from './MergeSettlementWriter.ts';

let scratchDirectory = '';

const settlementFilePath = (): string => join(scratchDirectory, 'target-merge-settlement.json');

const reading = (): ReturnType<MergeSettlementIngestion['read']> => new MergeSettlementIngestion(settlementFilePath()).read();

function storeDocument(document: Record<string, unknown>): void {
  writeFileSync(settlementFilePath(), `${JSON.stringify(document)}\n`);
}

beforeEach(() => {
  scratchDirectory = createScratchDirectory('merge-settlement-ingestion');
});

afterEach(() => {
  removeScratchDirectory(scratchDirectory);
});

test('no file is absent', () => {
  expect(reading()).toEqual({ verdict: 'absent' });
});

test.each<[string, TargetMergeSettlement]>([
  ['merged', { verdict: 'merged', mergeCommit: 'merge-commit' }],
  ['conflicted', { verdict: 'conflicted', conflictedFiles: ['shared.txt', 'docs/readme.md'] }],
  ['failed', { verdict: 'failed', reason: 'git cannot be found on Hephaestus\'s PATH.' }],
])('what the writer stores of a %s merge reads back as the same settlement', (_verdict, settlement) => {
  createMergeSettlementWriter(settlementFilePath()).write(settlement);
  expect(reading()).toEqual({ verdict: 'readable', settlement });
});

test('a file that is not JSON is unreadable', () => {
  writeFileSync(settlementFilePath(), '{"verdict": ');
  expect(reading()).toMatchObject({ verdict: 'unreadable' });
});

test('a settlement of another version, or of none, is unreadable', () => {
  storeDocument({ version: MERGE_SETTLEMENT_FORMAT_VERSION + 1, verdict: 'merged', mergeCommit: 'merge-commit' });
  expect(reading()).toEqual({ verdict: 'unreadable', reason: `its version is not ${MERGE_SETTLEMENT_FORMAT_VERSION}` });
  storeDocument({ verdict: 'merged', mergeCommit: 'merge-commit' });
  expect(reading()).toEqual({ verdict: 'unreadable', reason: `its version is not ${MERGE_SETTLEMENT_FORMAT_VERSION}` });
});

test.each([
  ['verdict', { verdict: 'aborted' }, 'its "verdict" is not a settlement'],
  ['mergeCommit', { verdict: 'merged' }, 'its "mergeCommit" is not a commit'],
  ['conflictedFiles', { verdict: 'conflicted', conflictedFiles: 'shared.txt' }, 'its "conflictedFiles" is not a list of paths'],
  ['reason', { verdict: 'failed', reason: 1 }, 'its "reason" is not text'],
])('a wrong %s is unreadable', (_field, document, reason) => {
  storeDocument({ version: MERGE_SETTLEMENT_FORMAT_VERSION, ...document });
  expect(reading()).toEqual({ verdict: 'unreadable', reason });
});

test('a folder where the file belongs is unreadable, not absent, and does not throw', () => {
  const ingestion = new MergeSettlementIngestion(scratchDirectory);
  expect(() => ingestion.read()).not.toThrow();
  expect(ingestion.read()).toMatchObject({ verdict: 'unreadable' });
});
