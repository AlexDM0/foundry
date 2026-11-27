/**
 * A step's `-verdict.json` both ways. What matters: what the writer stores reads back as the same verdict, its optional fields left out
 * staying out; a missing file is absent, since a step is judged the first time its verdict is read; and a verdict that is not JSON, of
 * another version or none, or changed by hand into a field of the wrong shape, a cache word or step ending outside the vocabularies
 * included, is unreadable, so a run never reuses it, and never throws.
 */
import { writeFileSync } from 'node:fs';
import { join }          from 'node:path';
import {
  afterEach,
  beforeEach,
  expect,
  test
} from 'bun:test';

import { createScratchDirectory, removeScratchDirectory }                      from '../../testing/ScratchWorkspace.ts';
import type { StepVerdictProblem }                                             from './@types/StepVerdictProblem.ts';
import { STEP_VERDICT_FORMAT_VERSION, StepVerdictIngestion, type StepVerdict } from './StepVerdictIngestion.ts';
import { createStepVerdictWriter }                                             from './StepVerdictWriter.ts';

let scratchDirectory = '';

const verdictFilePath = (): string => join(scratchDirectory, 'gate-1-verdict.json');

const reading = (): ReturnType<StepVerdictIngestion['read']> => new StepVerdictIngestion(verdictFilePath()).read();

const GATE_VERDICT: StepVerdict = {
  treeId:            'example-tree',
  phase:             'build',
  phaseHash:         'example-phase-hash',
  entityPhaseHashes: { shop: 'shop-phase-hash' },
  outcome:           'failed',
  output:            'one test failed\n',
  exitCode:          1,
  cacheReport:       'partial',
  stepRun:           {
    stepKind: 'gate', stepName: 'tests', entity: 'shop', runMilliseconds: 1200, ending: 'failed'
  },
};

function storeDocument(document: Record<string, unknown>): void {
  writeFileSync(verdictFilePath(), `${JSON.stringify(document)}\n`);
}

beforeEach(() => {
  scratchDirectory = createScratchDirectory('step-verdict-ingestion');
});

afterEach(() => {
  removeScratchDirectory(scratchDirectory);
});

test('no file is absent', () => {
  expect(reading()).toEqual({ verdict: 'absent' });
});

test('what the writer stores reads back as the same verdict, with its version', () => {
  createStepVerdictWriter(verdictFilePath()).write(GATE_VERDICT);
  expect(reading()).toEqual({ verdict: 'readable', stepVerdict: GATE_VERDICT });
});

test('a prepare step\'s verdict without its optional fields reads back without them', () => {
  const prepareVerdict: StepVerdict = {
    treeId: 'example-tree', phase: 'review', phaseHash: 'example-phase-hash', outcome: 'setup-failed', output: '', exitCode: null
  };
  createStepVerdictWriter(verdictFilePath()).write(prepareVerdict);
  expect(reading()).toEqual({ verdict: 'readable', stepVerdict: prepareVerdict });
});

test('a file that is not JSON is unreadable', () => {
  writeFileSync(verdictFilePath(), '{"treeId": ');
  expect(reading()).toMatchObject({ verdict: 'unreadable' });
});

test('a verdict of another version, or of none, is unreadable', () => {
  storeDocument({ ...GATE_VERDICT, version: STEP_VERDICT_FORMAT_VERSION + 1 });
  expect(reading()).toEqual({ verdict: 'unreadable', problem: { code: 'version-differs', field: 'version', expectedVersion: STEP_VERDICT_FORMAT_VERSION } });
  storeDocument({ ...GATE_VERDICT });
  expect(reading()).toEqual({ verdict: 'unreadable', problem: { code: 'version-differs', field: 'version', expectedVersion: STEP_VERDICT_FORMAT_VERSION } });
});

test.each<[string, Record<string, unknown>, StepVerdictProblem]>([
  ['treeId', { treeId: null }, { code: 'field-is-not', field: 'treeId', expected: 'text' }],
  ['phase', { phase: 'deploy' }, { code: 'field-is-not', field: 'phase', expected: 'a-gate-phase' }],
  ['phaseHash', { phaseHash: 3 }, { code: 'field-is-not', field: 'phaseHash', expected: 'text' }],
  ['entityPhaseHashes', { entityPhaseHashes: { shop: 1 } }, { code: 'field-is-not', field: 'entityPhaseHashes', expected: 'a-record-of-phase-hashes' }],
  ['outcome', { outcome: 'red' }, { code: 'field-is-not', field: 'outcome', expected: 'a-step-outcome' }],
  ['output', { output: ['line'] }, { code: 'field-is-not', field: 'output', expected: 'text' }],
  ['exitCode', { exitCode: '1' }, { code: 'field-is-not', field: 'exitCode', expected: 'an-exit-code-or-null' }],
  ['cacheReport', { cacheReport: 'warm' }, { code: 'field-is-not', field: 'cacheReport', expected: 'a-cache-report' }],
  ['stepRun', { stepRun: 'gate' }, { code: 'field-is-not', field: 'stepRun', expected: 'an-object' }],
  ['stepRun.stepKind', { stepRun: { ...GATE_VERDICT.stepRun, stepKind: 'install' } }, { code: 'field-is-not', field: 'stepRun.stepKind', expected: 'a-step-kind' }],
  ['stepRun.runMilliseconds', { stepRun: { ...GATE_VERDICT.stepRun, runMilliseconds: -1 } }, { code: 'field-is-not', field: 'stepRun.runMilliseconds', expected: 'a-run-time' }],
  ['stepRun.ending', { stepRun: { ...GATE_VERDICT.stepRun, ending: 'lost' } }, { code: 'field-is-not', field: 'stepRun.ending', expected: 'a-step-ending' }],
])('a wrong %s is unreadable', (_field, change, problem) => {
  storeDocument({ version: STEP_VERDICT_FORMAT_VERSION, ...GATE_VERDICT, ...change });
  expect(reading()).toEqual({ verdict: 'unreadable', problem });
});

test('a folder where the file belongs is unreadable, not absent, and does not throw', () => {
  const ingestion = new StepVerdictIngestion(scratchDirectory);
  expect(() => ingestion.read()).not.toThrow();
  expect(ingestion.read()).toMatchObject({ verdict: 'unreadable' });
});
