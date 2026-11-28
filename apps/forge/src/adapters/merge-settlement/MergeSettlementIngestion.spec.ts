/**
 * A merge's settlement both ways: each of the three settlements reads back as itself, a missing file is a merge still running, and any
 * other file is unreadable, never a merge still to settle again, and never a throw.
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
import type { MergeFailure }                                                                     from './@types/MergeFailure.ts';
import type { MergeSettlementProblem }                                                           from './@types/MergeSettlementProblem.ts';
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

test.each<[string, Exclude<TargetMergeSettlement, { verdict: 'failed' }>]>([
  ['merged', { verdict: 'merged', mergeCommit: 'merge-commit' }],
  ['conflicted', { verdict: 'conflicted', conflictedFiles: ['shared.txt', 'docs/readme.md'] }],
])('what the writer stores of a %s merge reads back as the same settlement', (_verdict, settlement) => {
  createMergeSettlementWriter(settlementFilePath()).write(settlement);
  expect(reading()).toEqual({ verdict: 'readable', settlement });
});

test.each<[MergeFailure, string]>([
  [{ code: 'git-not-found' }, 'git cannot be found on Hephaestus\'s PATH.'],
  [{ code: 'conflicted-merge-not-undone', mergedTip: 'target-tip', restoreVerdict: 'unknown-commit' }, 'The conflicted merge of target-tip could not be undone: unknown-commit.'],
  [{ code: 'stopped-without-conflicted-file', mergedTip: 'target-tip' }, 'The merge of target-tip stopped with no conflicted file.'],
  [{ code: 'merge-not-committed', mergedTip: 'target-tip', headCommit: 'head-commit' }, 'The merge of target-tip did not commit; HEAD is head-commit.'],
  [{ code: 'merge-not-committed', mergedTip: 'target-tip', headCommit: null }, 'The merge of target-tip did not commit; HEAD is unreadable.'],
])('a failed merge is stored under "reason" as today\'s sentence and reads back as that sentence: %o', (failure, sentence) => {
  createMergeSettlementWriter(settlementFilePath()).write({ verdict: 'failed', failure });
  expect(reading()).toEqual({ verdict: 'readable', settlement: { verdict: 'failed', storedReason: sentence } });
});

test('a file that is not JSON is unreadable', () => {
  writeFileSync(settlementFilePath(), '{"verdict": ');
  expect(reading()).toMatchObject({ verdict: 'unreadable' });
});

test('a settlement of another version, or of none, is unreadable', () => {
  storeDocument({ version: MERGE_SETTLEMENT_FORMAT_VERSION + 1, verdict: 'merged', mergeCommit: 'merge-commit' });
  expect(reading()).toEqual({ verdict: 'unreadable', problem: { code: 'version-differs', field: 'version', expectedVersion: MERGE_SETTLEMENT_FORMAT_VERSION } });
  storeDocument({ verdict: 'merged', mergeCommit: 'merge-commit' });
  expect(reading()).toEqual({ verdict: 'unreadable', problem: { code: 'version-differs', field: 'version', expectedVersion: MERGE_SETTLEMENT_FORMAT_VERSION } });
});

test.each<[string, Record<string, unknown>, MergeSettlementProblem]>([
  ['verdict', { verdict: 'aborted' }, { code: 'not-a-settlement', field: 'verdict' }],
  ['mergeCommit', { verdict: 'merged' }, { code: 'field-is-not', field: 'mergeCommit', expected: 'a-commit' }],
  ['conflictedFiles', { verdict: 'conflicted', conflictedFiles: 'shared.txt' }, { code: 'field-is-not', field: 'conflictedFiles', expected: 'a-list-of-paths' }],
  ['reason', { verdict: 'failed', reason: 1 }, { code: 'field-is-not', field: 'reason', expected: 'text' }],
])('a wrong %s is unreadable', (_field, document, problem) => {
  storeDocument({ version: MERGE_SETTLEMENT_FORMAT_VERSION, ...document });
  expect(reading()).toEqual({ verdict: 'unreadable', problem });
});

test('a folder where the file belongs is unreadable, not absent, and does not throw', () => {
  const ingestion = new MergeSettlementIngestion(scratchDirectory);
  expect(() => ingestion.read()).not.toThrow();
  expect(ingestion.read()).toMatchObject({ verdict: 'unreadable' });
});
