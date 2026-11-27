/**
 * A step's `-verdict.json` both ways: what the writer stores reads back the same, a missing file is a step not judged yet, and a verdict
 * of another version or changed by hand into the wrong shape is unreadable, so a run never reuses it, and nothing throws.
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
  expect(reading()).toEqual({ verdict: 'unreadable', reason: `its version is not ${STEP_VERDICT_FORMAT_VERSION}` });
  storeDocument({ ...GATE_VERDICT });
  expect(reading()).toEqual({ verdict: 'unreadable', reason: `its version is not ${STEP_VERDICT_FORMAT_VERSION}` });
});

test.each([
  ['treeId', { treeId: null }, 'its "treeId" is not text'],
  ['phase', { phase: 'deploy' }, 'its "phase" is not a gate phase'],
  ['phaseHash', { phaseHash: 3 }, 'its "phaseHash" is not text'],
  ['entityPhaseHashes', { entityPhaseHashes: { shop: 1 } }, 'its "entityPhaseHashes" is not a record of phase hashes'],
  ['outcome', { outcome: 'red' }, 'its "outcome" is not a step outcome'],
  ['output', { output: ['line'] }, 'its "output" is not text'],
  ['exitCode', { exitCode: '1' }, 'its "exitCode" is not an exit code or null'],
  ['cacheReport', { cacheReport: 'warm' }, 'its "cacheReport" is not a cache report'],
  ['stepRun', { stepRun: 'gate' }, 'its "stepRun" is not an object'],
  ['stepRun.stepKind', { stepRun: { ...GATE_VERDICT.stepRun, stepKind: 'install' } }, 'its "stepRun.stepKind" is not a step kind'],
  ['stepRun.runMilliseconds', { stepRun: { ...GATE_VERDICT.stepRun, runMilliseconds: -1 } }, 'its "stepRun.runMilliseconds" is not a run time'],
  ['stepRun.ending', { stepRun: { ...GATE_VERDICT.stepRun, ending: 'lost' } }, 'its "stepRun.ending" is not a step ending'],
])('a wrong %s is unreadable', (_field, change, reason) => {
  storeDocument({ version: STEP_VERDICT_FORMAT_VERSION, ...GATE_VERDICT, ...change });
  expect(reading()).toEqual({ verdict: 'unreadable', reason });
});

test('a folder where the file belongs is unreadable, not absent, and does not throw', () => {
  const ingestion = new StepVerdictIngestion(scratchDirectory);
  expect(() => ingestion.read()).not.toThrow();
  expect(ingestion.read()).toMatchObject({ verdict: 'unreadable' });
});
