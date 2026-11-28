/**
 * A package stage's statement both ways. What matters: each of the five statements the writer stores reads back as itself; a missing file
 * is absent, a stage that left no statement, which is a normal case; and a file that is not JSON, of another version or none, of a stage
 * that keeps no statement, or missing a field its stage keeps is unreadable, never a stage that stated nothing, and never a throw.
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
import type { StageStatementProblem }                                                   from './@types/StageStatementProblem.ts';
import { STAGE_STATEMENT_FORMAT_VERSION, type StageStatement, StageStatementIngestion } from './StageStatementIngestion.ts';
import { createStageStatementWriter }                                                   from './StageStatementWriter.ts';

let scratchDirectory = '';

const statementFilePath = (): string => join(scratchDirectory, 'stage-statement.json');

const reading = (): ReturnType<StageStatementIngestion['read']> => new StageStatementIngestion(statementFilePath()).read();

function storeDocument(document: Record<string, unknown>): void {
  writeFileSync(statementFilePath(), `${JSON.stringify(document)}\n`);
}

beforeEach(() => {
  scratchDirectory = createScratchDirectory('stage-statement-ingestion');
});

afterEach(() => {
  removeScratchDirectory(scratchDirectory);
});

test('no file is absent', () => {
  expect(reading()).toEqual({ verdict: 'absent' });
});

test.each<[string, StageStatement]>([
  ['package-build', { stage: 'package-build', exposedSurfaceChanged: false }],
  ['package-review', {
    stage: 'package-review', exposedSurfaceConfirmed: true, reviewText: 'The export holds.', sealedReachPaths: ['bun.lock']
  }],
  ['package-review-findings', { stage: 'package-review-findings', reviewSection: '## Review 1\n\nThe export returns cents.' }],
  ['adapt', { stage: 'adapt', returnedPackage: 'tokens', packageReturnReason: 'The package must export a formatter.' }],
  ['package-refused', { stage: 'package-refused', refusedReason: 'The constitution forbids the change.' }],
])('what the writer stores of a %s statement reads back as the same statement', (_stage, statement) => {
  createStageStatementWriter(statementFilePath()).write(statement);
  expect(reading()).toEqual({ verdict: 'readable', statement });
});

test('a file that is not JSON is unreadable', () => {
  writeFileSync(statementFilePath(), '{"stage": ');
  expect(reading()).toMatchObject({ verdict: 'unreadable' });
});

test('a statement of another version, or of none, is unreadable', () => {
  storeDocument({ version: STAGE_STATEMENT_FORMAT_VERSION + 1, stage: 'package-build', exposedSurfaceChanged: true });
  expect(reading()).toEqual({ verdict: 'unreadable', problem: { code: 'version-differs', field: 'version', expectedVersion: STAGE_STATEMENT_FORMAT_VERSION } });
  storeDocument({ stage: 'package-build', exposedSurfaceChanged: true });
  expect(reading()).toEqual({ verdict: 'unreadable', problem: { code: 'version-differs', field: 'version', expectedVersion: STAGE_STATEMENT_FORMAT_VERSION } });
});

test.each<[string, Record<string, unknown>, StageStatementProblem]>([
  ['stage', { stage: 'build' }, { code: 'not-a-statement-stage', field: 'stage' }],
  ['exposedSurfaceChanged', { stage: 'package-build', exposedSurfaceChanged: 'no' }, { code: 'field-is-not', field: 'exposedSurfaceChanged', expected: 'true-or-false' }],
  ['sealedReachPaths', {
    stage: 'package-review', exposedSurfaceConfirmed: true, reviewText: '', sealedReachPaths: 'bun.lock'
  }, { code: 'field-is-not', field: 'sealedReachPaths', expected: 'a-list-of-paths' }],
  ['reviewSection', { stage: 'package-review-findings' }, { code: 'field-is-not', field: 'reviewSection', expected: 'text' }],
  ['packageReturnReason', { stage: 'adapt', returnedPackage: 'tokens', packageReturnReason: 1 }, { code: 'field-is-not', field: 'packageReturnReason', expected: 'text' }],
  ['refusedReason', { stage: 'package-refused', refusedReason: null }, { code: 'field-is-not', field: 'refusedReason', expected: 'text' }],
])('a wrong %s is unreadable', (_field, document, problem) => {
  storeDocument({ version: STAGE_STATEMENT_FORMAT_VERSION, ...document });
  expect(reading()).toEqual({ verdict: 'unreadable', problem });
});

test('a folder where the file belongs is unreadable, not absent, and does not throw', () => {
  const ingestion = new StageStatementIngestion(scratchDirectory);
  expect(() => ingestion.read()).not.toThrow();
  expect(ingestion.read()).toMatchObject({ verdict: 'unreadable' });
});
